import { BaseTool, ToolSchema } from './types';
import {
  COINDCX_DOCS_URL,
  fetchActiveFuturesInstruments,
  fetchFuturesInstrumentDetails,
  fetchFuturesOrderbookJson,
  fetchFuturesPublicTrades,
  fetchPublicOhlcv,
  isCoinDcxFuturesPair,
} from './coindcx-public';

const API_BASE = 'https://api.coindcx.com';
const PUBLIC_BASE = 'https://public.coindcx.com';

function parseOrderbookDepth(raw: string | undefined): 10 | 20 | 50 {
  const n = parseInt(String(raw ?? '20'), 10);
  if (n === 10 || n === 20 || n === 50) return n;
  return 20;
}

function parseFuturesMargin(raw: unknown): 'USDT' | 'INR' {
  const s = String(raw ?? 'USDT').toUpperCase();
  return s === 'INR' ? 'INR' : 'USDT';
}

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

/** Map ETHUSDT / BTC / B-BTC_USDT → canonical CoinDCX futures keys for matching */
function futuresFilterKeys(symbol?: string): string[] {
  if (!symbol?.trim()) return [];
  const u = symbol.trim().toUpperCase();
  // If it's already a clean B-*_USDT symbol, use it as is
  if (/^B-[A-Z0-9]+_USDT$/.test(u)) return [u];
  
  // Shorthand: SOLUSDT -> B-SOL_USDT
  const m = u.match(/^([A-Z0-9]{2,10})USDT$/);
  if (m) return [`B-${m[1]}_USDT`, u];

  // Fallback: strip junk but try to maintain the B- prefix if present
  const cleaned = u.replace(/[^-A-Z0-9_]/g, '');
  return [cleaned, u];
}

/**
 * CoinDCX `/market_data/v3/current_prices/futures/rt` returns `{ ts, vs, prices: { "B-ETH_USDT": { mp, ls, h, l, pc, ... } } }`.
 * Older code assumed an array of rows — normalize to `{ symbol, ...fields }` rows.
 */
function normalizeFuturesRtPayload(data: unknown): { symbol: string; [k: string]: unknown }[] {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return [];
  const prices = d.prices;
  if (prices && typeof prices === 'object' && !Array.isArray(prices)) {
    return Object.entries(prices as Record<string, Record<string, unknown>>).map(([key, v]) => ({
      symbol: key,
      ...(typeof v === 'object' && v ? v : {}),
    }));
  }
  if (Array.isArray(data)) return data as { symbol: string }[];
  return Object.values(d).filter((x): x is { symbol: string } => x != null && typeof x === 'object' && 'symbol' in (x as object)) as { symbol: string }[];
}

/** Futures current prices — symbol: ETH, ETHUSDT, B-ETH_USDT */
function formatFuturesPrices(data: unknown, symbol?: string): string {
  const entries = normalizeFuturesRtPayload(data);
  const keys = futuresFilterKeys(symbol);
  const wantAll = !symbol?.trim();

  const filtered = wantAll
    ? entries.slice(0, 25)
    : entries.filter((e: any) => {
        const sym = String(e.symbol ?? e.pair ?? '').toUpperCase();
        return keys.some(k => sym === k);
      });

  if (filtered.length === 0) {
    const sample = entries.slice(0, 5).map((e: any) => e.symbol ?? e.pair ?? '?').join(', ');
    return `No futures match for "${symbol ?? '(none)'}". Try symbol=ETH, ETHUSDT, or B-ETH_USDT. Sample keys: ${sample || 'n/a'}`;
  }

  const row = (e: any) => {
    const sym = e.symbol ?? e.pair ?? '?';
    const mark = e.mp ?? e.mark_price ?? e.markPrice ?? '?';
    const last = e.ls ?? e.last_price ?? e.lastPrice ?? '?';
    const idx = e.index_price ?? e.indexPrice ?? '?';
    const fr = e.fr ?? e.funding_rate ?? e.fundingRate ?? 'n/a';
    const pc = e.pc != null ? `${e.pc}%` : 'n/a';
    return `${sym}: mark=${mark} last=${last} index=${idx} 24h%=${pc} funding=${fr}`;
  };
  return `Futures prices (${filtered.length} match):\n${filtered.map(row).join('\n')}`;
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

/** GET …/futures/data/trades — price, quantity, timestamp(ms), is_maker */
function formatFuturesTrades(data: unknown, pair: string): string {
  if (!Array.isArray(data)) return `Futures trades ${pair}: ${JSON.stringify(data)}`;
  const rows = data.slice(0, 15).map((t: any) => {
    const ts = t.timestamp != null ? new Date(Number(t.timestamp)).toISOString() : '?';
    const side = t.is_maker === true ? 'maker' : t.is_maker === false ? 'taker' : '?';
    return `  ${ts} price=${t.price} qty=${t.quantity} ${side}`;
  });
  return `Futures trades ${pair} (docs: ${COINDCX_DOCS_URL}, last ${rows.length}):\n${rows.join('\n')}`;
}

function formatActiveInstruments(data: unknown, margin: 'USDT' | 'INR'): string {
  if (!Array.isArray(data)) return JSON.stringify(data, null, 2);
  const arr = data as string[];
  const head = arr.slice(0, 80).join(', ');
  const tail = arr.length > 80 ? `\n… and ${arr.length - 80} more` : '';
  return `${arr.length} active futures instruments (${margin} margin). First 80:\n${head}${tail}`;
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
    '**Primary tool for CoinDCX market data** (no user API keys): spot tickers/markets, futures RT prices, OHLCV, order books, public futures meta. ' +
    `Official API reference: ${COINDCX_DOCS_URL} — spot vs futures use different hosts/paths; futures perps use **B-BASE_USDT**. ` +
    'For structure/SMC setups prefer **smc_analysis**. Authenticated trading is **coindcx_futures** only.';
  readonly schema: ToolSchema = {
    name: 'coindcx',
    description: `Fetch public CoinDCX market data (${COINDCX_DOCS_URL})`,
    args: {
      action: {
        type: 'string',
        description:
          'spot_ticker | futures_prices | markets | market_details | orderbook | trade_history | candles | ' +
          'futures_instruments | futures_instrument | futures_trades',
        required: true,
      },
      symbol: {
        type: 'string',
        description:
          'Spot: BTCINR, BTCUSDT. Futures perp: B-BTC_USDT (or ETHUSDT shorthand on futures_prices). ' +
          'Required for: orderbook, trade_history, candles, futures_instrument, futures_trades.',
        required: false,
      },
      interval: {
        type: 'string',
        description: 'Candle interval: 1m 5m 15m 30m 1h 4h 1d (default 1h). Futures OHLCV uses public candlesticks where supported.',
        required: false,
      },
      limit: {
        type: 'string',
        description: 'Max candles / trade rows (default 20)',
        required: false,
      },
      depth: {
        type: 'string',
        description: 'Futures v3 order book depth only: 10, 20, or 50 (default 20). See GET …/v3/orderbook/{pair}-futures/{depth}.',
        required: false,
      },
      margin: {
        type: 'string',
        description: 'Futures margin mode for futures_instruments / futures_instrument: USDT or INR (default USDT).',
        required: false,
      },
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '');
    const symbol = args.symbol ? String(args.symbol).trim() : undefined;
    const interval = String(args.interval ?? '1h');
    const limit = String(args.limit ?? '20');
    const candleLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 20));

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
          if (!symbol) return 'Error: symbol required for orderbook (e.g. B-BTC_USDT or BTCINR)';
          if (isCoinDcxFuturesPair(symbol)) {
            const depth = parseOrderbookDepth(String(args.depth));
            const data = await fetchFuturesOrderbookJson(symbol, depth);
            return formatOrderbook(data as any, symbol);
          }
          const data = await apiFetch(PUBLIC_BASE, '/market_data/orderbook', { pair: symbol });
          return formatOrderbook(data, symbol);
        }

        case 'trade_history': {
          if (!symbol) return 'Error: symbol required for trade_history (e.g. B-BTC_USDT)';
          const data = await apiFetch(PUBLIC_BASE, '/market_data/trade_history', { pair: symbol, limit }) as unknown[];
          return formatTrades(data, symbol);
        }

        case 'candles': {
          if (!symbol) return 'Error: symbol required for candles (e.g. B-BTC_USDT or BTCUSDT spot pair)';
          const bars = await fetchPublicOhlcv(symbol, interval, candleLimit);
          if (bars.length === 0) {
            return (
              `No OHLCV for pair=${symbol} interval=${interval}. ` +
              `Futures perps (B-*_USDT) use public candlesticks then legacy candles; spot uses market_data/candles. ` +
              `See ${COINDCX_DOCS_URL}`
            );
          }
          return formatCandles(bars as unknown[], symbol, interval);
        }

        case 'futures_instruments': {
          const margin = parseFuturesMargin(args.margin);
          const data = await fetchActiveFuturesInstruments(margin);
          return formatActiveInstruments(data, margin);
        }

        case 'futures_instrument': {
          if (!symbol) return 'Error: symbol required for futures_instrument (e.g. B-BTC_USDT)';
          const margin = parseFuturesMargin(args.margin);
          const data = await fetchFuturesInstrumentDetails(symbol, margin);
          return JSON.stringify(data, null, 2);
        }

        case 'futures_trades': {
          if (!symbol) return 'Error: symbol required for futures_trades (e.g. B-BTC_USDT)';
          const data = await fetchFuturesPublicTrades(symbol);
          return formatFuturesTrades(data, symbol);
        }

        default:
          return (
            `Unknown action "${action}". Valid: spot_ticker | futures_prices | markets | market_details | ` +
            `orderbook | trade_history | candles | futures_instruments | futures_instrument | futures_trades`
          );
      }
    } catch (err) {
      return `CoinDCX error: ${(err as Error).message}`;
    }
  }
}
