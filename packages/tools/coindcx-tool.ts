import { BaseTool, ToolSchema } from './types';

const BASE_URL = 'https://api.coindcx.com';

type Action = 'ticker' | 'markets' | 'market_details' | 'orderbook' | 'trade_history' | 'candles';

async function apiFetch(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`CoinDCX API ${res.status}: ${await res.text()}`);
  return res.json();
}

function summariseTicker(data: unknown[]): string {
  const top = data.slice(0, 20).map((m: any) =>
    `${m.market}: last=${m.last_price} bid=${m.bid} ask=${m.ask} vol=${m.volume} change=${m.change_24_hour ?? 'n/a'}`
  );
  return `Top 20 tickers (of ${data.length}):\n${top.join('\n')}`;
}

function summariseOrderbook(data: any, pair: string): string {
  const bids = (data.bids ?? []).slice(0, 5).map((b: any) => `  bid ${b[0]} qty ${b[1]}`).join('\n');
  const asks = (data.asks ?? []).slice(0, 5).map((a: any) => `  ask ${a[0]} qty ${a[1]}`).join('\n');
  return `Orderbook for ${pair} (top 5 each side):\nBids:\n${bids}\nAsks:\n${asks}`;
}

function summariseTrades(data: unknown[], pair: string): string {
  const trades = (data as any[]).slice(0, 10).map(t =>
    `  ${t.time_epoch ? new Date(t.time_epoch).toISOString() : '?'} ${t.m ? 'BUY' : 'SELL'} price=${t.p ?? t.price} qty=${t.q ?? t.quantity}`
  );
  return `Last ${trades.length} trades for ${pair}:\n${trades.join('\n')}`;
}

function summariseCandles(data: unknown[], pair: string, interval: string): string {
  const candles = (data as any[]).slice(-10).map(c =>
    `  open=${c.open} high=${c.high} low=${c.low} close=${c.close} vol=${c.volume} time=${new Date(c.time).toISOString()}`
  );
  return `Last ${candles.length} candles for ${pair} [${interval}]:\n${candles.join('\n')}`;
}

export class CoinDCXTool extends BaseTool {
  readonly name = 'coindcx';
  readonly description = 'Fetch live crypto market data from CoinDCX (ticker, orderbook, trade history, OHLCV candles, market list)';
  readonly schema: ToolSchema = {
    name: 'coindcx',
    description: 'Fetch live crypto market data from CoinDCX exchange',
    args: {
      action: {
        type: 'string',
        description: 'One of: ticker | markets | market_details | orderbook | trade_history | candles',
        required: true,
      },
      pair: {
        type: 'string',
        description: 'Market pair e.g. BTCINR, ETHINR (required for orderbook, trade_history, candles)',
        required: false,
      },
      interval: {
        type: 'string',
        description: 'Candle interval: 1m 5m 15m 30m 1h 2h 4h 6h 8h 1d 3d 1w 1M (default 1h)',
        required: false,
      },
      limit: {
        type: 'string',
        description: 'Number of results to return (default 20, max 500)',
        required: false,
      },
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '') as Action;
    const pair = String(args.pair ?? '').toUpperCase();
    const interval = String(args.interval ?? '1h');
    const limit = String(args.limit ?? '20');

    try {
      switch (action) {
        case 'ticker': {
          const data = await apiFetch('/exchange/ticker') as unknown[];
          return summariseTicker(data);
        }

        case 'markets': {
          const data = await apiFetch('/exchange/v1/markets') as unknown[];
          const sample = (data as string[]).slice(0, 30).join(', ');
          return `${data.length} markets available. Sample: ${sample}`;
        }

        case 'market_details': {
          const data = await apiFetch('/exchange/v1/markets_details') as unknown[];
          const filtered = pair
            ? (data as any[]).filter(m => m.pair?.toUpperCase().includes(pair))
            : (data as any[]).slice(0, 10);
          return JSON.stringify(filtered, null, 2);
        }

        case 'orderbook': {
          if (!pair) return 'Error: pair required for orderbook (e.g. BTCINR)';
          const data = await apiFetch('/market_data/orderbook', { pair });
          return summariseOrderbook(data, pair);
        }

        case 'trade_history': {
          if (!pair) return 'Error: pair required for trade_history (e.g. BTCINR)';
          const data = await apiFetch('/market_data/trade_history', { pair, limit }) as unknown[];
          return summariseTrades(data, pair);
        }

        case 'candles': {
          if (!pair) return 'Error: pair required for candles (e.g. BTCINR)';
          const now = Date.now();
          const startTime = String(now - 7 * 24 * 60 * 60 * 1000);
          const data = await apiFetch('/market_data/candles', {
            pair, interval, startTime, endTime: String(now), limit,
          }) as unknown[];
          return summariseCandles(data, pair, interval);
        }

        default:
          return `Unknown action "${action}". Valid: ticker | markets | market_details | orderbook | trade_history | candles`;
      }
    } catch (err) {
      return `CoinDCX error: ${(err as Error).message}`;
    }
  }
}
