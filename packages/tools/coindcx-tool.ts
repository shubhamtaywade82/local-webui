import { BaseTool, ToolSchema } from './types';

const API_BASE = 'https://api.coindcx.com';
const PUBLIC_BASE = 'https://public.coindcx.com';

async function apiFetch(base: string, path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${base}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`CoinDCX ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Spot ticker — returns all markets, filter by symbol (e.g. BTCINR, ETHINR, BTCUSDT) */
function formatTicker(data: unknown[], symbol?: string): string {
  const markets = data as any[];
  const filtered = symbol
    ? markets.filter(m =>
        m.market?.toUpperCase() === symbol.toUpperCase() ||
        m.market?.toUpperCase().includes(symbol.toUpperCase())
      )
    : markets.slice(0, 20);

  if (filtered.length === 0) {
    const sample = markets.slice(0, 10).map(m => m.market).join(', ');
    return `No match for "${symbol}". Sample markets: ${sample}\nTip: Try BTCUSDT, ETHINR, SNTBTC etc.`;
  }

  const rows = filtered.map((m: any) =>
    `${m.market}: last=${m.last_price} bid=${m.bid} ask=${m.ask} vol=${m.volume} 24h=${m.change_24_hour ?? 'n/a'}%`
  );
  return `Spot ticker (${filtered.length} match):\n${rows.join('\n')}`;
}

/** Futures current prices — symbol format: B-BTC_USDT */
function formatFuturesPrices(data: unknown, symbol?: string): string {
  // Response is array or object keyed by symbol
  const entries: any[] = Array.isArray(data) ? data : Object.values(data as object);
  const filtered = symbol
    ? entries.filter((e: any) => {
        const key = (e.symbol ?? e.pair ?? JSON.stringify(e)).toUpperCase();
        return key.includes(symbol.toUpperCase());
      })
    : entries.slice(0, 20);

  if (filtered.length === 0) {
    const sample = entries.slice(0, 5).map((e: any) => e.symbol ?? e.pair ?? '?').join(', ');
    return `No futures match for "${symbol}". Sample: ${sample}\nTip: Use format B-BTC_USDT`;
  }

  const rows = filtered.map((e: any) =>
    `${e.symbol ?? e.pair}: mark=${e.mark_price ?? e.markPrice ?? '?'} index=${e.index_price ?? e.indexPrice ?? '?'} last=${e.last_price ?? e.lastPrice ?? '?'} funding=${e.funding_rate ?? e.fundingRate ?? 'n/a'}`
  );
  return `Futures prices (${filtered.length} match):\n${rows.join('\n')}`;
}

function formatOrderbook(data: any, pair: string): string {
  const bids = (data.bids ?? []).slice(0, 5).map((b: any) => `  bid ${b[0]} qty ${b[1]}`).join('\n');
  const asks = (data.asks ?? []).slice(0, 5).map((a: any) => `  ask ${a[0]} qty ${a[1]}`).join('\n');
  return `Orderbook ${pair} (top 5):\nBids:\n${bids}\nAsks:\n${asks}`;
}

function formatTrades(data: unknown[], pair: string): string {
  const rows = (data as any[]).slice(0, 10).map(t =>
    `  ${t.time_epoch ? new Date(t.time_epoch).toISOString() : '?'} ${t.m ? 'BUY' : 'SELL'} price=${t.p ?? t.price} qty=${t.q ?? t.quantity}`
  );
  return `Last ${rows.length} trades for ${pair}:\n${rows.join('\n')}`;
}

function formatCandles(data: unknown[], pair: string, interval: string): string {
  const rows = (data as any[]).slice(-10).map(c =>
    `  open=${c.open} high=${c.high} low=${c.low} close=${c.close} vol=${c.volume} t=${new Date(c.time).toISOString()}`
  );
  return `Last ${rows.length} candles ${pair} [${interval}]:\n${rows.join('\n')}`;
}

export class CoinDCXTool extends BaseTool {
  readonly name = 'coindcx';
  readonly description =
    'Fetch live crypto market data from CoinDCX. Spot pairs: BTCINR, ETHINR, BTCUSDT etc. Futures pairs: B-BTC_USDT, B-ETH_USDT etc.';
  readonly schema: ToolSchema = {
    name: 'coindcx',
    description: 'Fetch live crypto market data from CoinDCX exchange (spot + futures)',
    args: {
      action: {
        type: 'string',
        description:
          'One of: spot_ticker | futures_prices | markets | market_details | orderbook | trade_history | candles',
        required: true,
      },
      symbol: {
        type: 'string',
        description:
          'Filter symbol. Spot: BTCINR, ETHINR, BTCUSDT. Futures: B-BTC_USDT, B-ETH_USDT. Omit for all.',
        required: false,
      },
      interval: {
        type: 'string',
        description: 'Candle interval: 1m 5m 15m 1h 4h 1d (default 1h)',
        required: false,
      },
      limit: {
        type: 'string',
        description: 'Number of results (default 20)',
        required: false,
      },
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '');
    const symbol = args.symbol ? String(args.symbol).trim() : undefined;
    const interval = String(args.interval ?? '1h');
    const limit = String(args.limit ?? '20');

    try {
      switch (action) {
        case 'spot_ticker': {
          const data = await apiFetch(API_BASE, '/exchange/ticker') as unknown[];
          return formatTicker(data, symbol);
        }

        case 'futures_prices': {
          // Batch endpoint returns all current futures prices
          const data = await apiFetch(PUBLIC_BASE, '/market_data/v3/current_prices/futures/rt');
          return formatFuturesPrices(data, symbol ?? 'BTC_USDT');
        }

        case 'markets': {
          const data = await apiFetch(API_BASE, '/exchange/v1/markets') as string[];
          const filtered = symbol
            ? data.filter(m => m.toUpperCase().includes(symbol.toUpperCase()))
            : data;
          return `${filtered.length} markets${symbol ? ` matching "${symbol}"` : ''}:\n${filtered.slice(0, 50).join(', ')}`;
        }

        case 'market_details': {
          const data = await apiFetch(API_BASE, '/exchange/v1/markets_details') as any[];
          const filtered = symbol
            ? data.filter(m => m.pair?.toUpperCase().includes(symbol.toUpperCase()))
            : data.slice(0, 10);
          return JSON.stringify(filtered, null, 2);
        }

        case 'orderbook': {
          if (!symbol) return 'Error: symbol required for orderbook (e.g. BTCINR or B-BTC_USDT)';
          const data = await apiFetch(API_BASE, '/market_data/orderbook', { pair: symbol });
          return formatOrderbook(data, symbol);
        }

        case 'trade_history': {
          if (!symbol) return 'Error: symbol required for trade_history (e.g. BTCINR)';
          const data = await apiFetch(API_BASE, '/market_data/trade_history', { pair: symbol, limit }) as unknown[];
          return formatTrades(data, symbol);
        }

        case 'candles': {
          if (!symbol) return 'Error: symbol required for candles (e.g. BTCINR)';
          const now = Date.now();
          const startTime = String(now - 7 * 24 * 60 * 60 * 1000);
          const data = await apiFetch(API_BASE, '/market_data/candles', {
            pair: symbol, interval, startTime, endTime: String(now), limit,
          }) as unknown[];
          return formatCandles(data, symbol, interval);
        }

        default:
          return `Unknown action "${action}". Valid: spot_ticker | futures_prices | markets | market_details | orderbook | trade_history | candles`;
      }
    } catch (err) {
      return `CoinDCX error: ${(err as Error).message}`;
    }
  }
}
