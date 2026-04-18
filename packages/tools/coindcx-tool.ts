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

/** Spot ticker — returns all markets from exchange, filter by symbol or base asset */
function formatTicker(data: unknown[], symbol?: string): string {
  const markets = data as any[];

  if (!symbol) {
    // No filter: show top 20 by volume
    const top = [...markets]
      .sort((a, b) => parseFloat(b.volume ?? 0) - parseFloat(a.volume ?? 0))
      .slice(0, 20);
    const rows = top.map((m: any) =>
      `${m.market}: last=${m.last_price} bid=${m.bid} ask=${m.ask} vol=${m.volume} 24h=${m.change_24_hour ?? 'n/a'}%`
    );
    return `Top 20 by volume (of ${markets.length} total):\n${rows.join('\n')}`;
  }

  const q = symbol.toUpperCase();
  const filtered = markets.filter(m => {
    const name: string = (m.market ?? '').toUpperCase();
    // exact match, starts-with, or contains
    return name === q || name.startsWith(q) || name.includes(q);
  });

  if (filtered.length === 0) {
    // Suggest similar markets
    const similar = markets
      .filter(m => (m.market ?? '').toUpperCase().includes(q.replace(/INR|USDT|BTC$/, '')))
      .slice(0, 8)
      .map(m => m.market);
    return `No match for "${symbol}" among ${markets.length} markets.\nSimilar: ${similar.join(', ') || 'none found'}\nTip: use markets action to list all available symbols.`;
  }

  const rows = filtered.map((m: any) =>
    `${m.market}: last=${m.last_price} bid=${m.bid} ask=${m.ask} vol=${m.volume} 24h=${m.change_24_hour ?? 'n/a'}%`
  );
  return `Spot ticker (${filtered.length} match for "${symbol}" of ${markets.length} total):\n${rows.join('\n')}`;
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
  // bids/asks are objects: { "price": "qty", ... } — convert to sorted arrays
  const toRows = (side: Record<string, string>, dir: 'bid' | 'ask', n = 5) =>
    Object.entries(side ?? {})
      .sort((a, b) => dir === 'bid' ? parseFloat(b[0]) - parseFloat(a[0]) : parseFloat(a[0]) - parseFloat(b[0]))
      .slice(0, n)
      .map(([price, qty]) => `  ${dir} ${price} qty ${qty}`)
      .join('\n');
  return `Orderbook ${pair} (top 5 each side):\nBids:\n${toRows(data.bids, 'bid')}\nAsks:\n${toRows(data.asks, 'ask')}`;
}

function formatTrades(data: unknown[], pair: string): string {
  const rows = (data as any[]).slice(0, 10).map(t =>
    // API returns: p=price, q=qty, T=timestamp(ms), m=buyer-is-maker
    `  ${t.T ? new Date(t.T).toISOString() : '?'} ${t.m ? 'SELL' : 'BUY'} price=${t.p} qty=${t.q}`
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
    'Fetch live crypto market data from CoinDCX. If unsure of a symbol, call action=markets with symbol=BTC first to discover valid pairs, then call spot_ticker with the exact pair. Spot pairs: BTCINR, BTCUSDT. Futures: B-BTC_USDT.';
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
          const preview = filtered.slice(0, 100).join(', ');
          return `${filtered.length} markets${symbol ? ` matching "${symbol}"` : ' (showing first 100)'}:\n${preview}`;
        }

        case 'market_details': {
          const data = await apiFetch(API_BASE, '/exchange/v1/markets_details') as any[];
          const filtered = symbol
            ? data.filter(m => m.pair?.toUpperCase().includes(symbol.toUpperCase()))
            : data.slice(0, 10);
          return JSON.stringify(filtered, null, 2);
        }

        case 'orderbook': {
          if (!symbol) return 'Error: symbol required for orderbook (e.g. B-BTC_USDT)';
          const data = await apiFetch(PUBLIC_BASE, '/market_data/orderbook', { pair: symbol });
          return formatOrderbook(data, symbol);
        }

        case 'trade_history': {
          if (!symbol) return 'Error: symbol required for trade_history (e.g. B-BTC_USDT)';
          const data = await apiFetch(PUBLIC_BASE, '/market_data/trade_history', { pair: symbol, limit }) as unknown[];
          return formatTrades(data, symbol);
        }

        case 'candles': {
          if (!symbol) return 'Error: symbol required for candles (e.g. B-BTC_USDT)';
          const now = Date.now();
          const startTime = String(now - 7 * 24 * 60 * 60 * 1000);
          const data = await apiFetch(PUBLIC_BASE, '/market_data/candles', {
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
