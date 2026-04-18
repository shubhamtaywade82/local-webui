/**
 * CoinDCX public HTTP helpers aligned with https://docs.coindcx.com/
 * (Spot ticker/markets on api.coindcx.com; futures OHLCV, order book, RT prices on public.coindcx.com.)
 */

export const COINDCX_DOCS_URL = 'https://docs.coindcx.com/';

const PUBLIC_BASE = 'https://public.coindcx.com';
const API_BASE = 'https://api.coindcx.com';

export interface OhlcvBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export function isCoinDcxFuturesPair(pair: string): boolean {
  return /^B-[A-Z0-9]+_USDT$/i.test(pair.trim());
}

/** REST `resolution` for GET /market_data/candlesticks (pcode=f). See docs table (1, 5, 60, 1D, …). */
const FUTURES_CANDLESTICK_RESOLUTION: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '6h': '360',
  '8h': '480',
  '1d': '1D',
  '1D': '1D',
};

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '6h': 21_600_000,
  '8h': 28_800_000,
  '1d': 86_400_000,
  '1D': 86_400_000,
};

function toFiniteBars(rows: unknown[]): OhlcvBar[] {
  return rows
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
    .map((c) => ({
      open: parseFloat(String(c.open)),
      high: parseFloat(String(c.high)),
      low: parseFloat(String(c.low)),
      close: parseFloat(String(c.close)),
      volume: parseFloat(String(c.volume ?? 0)),
      time: typeof c.time === 'number' ? c.time : parseInt(String(c.time), 10),
    }))
    .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.time))
    .sort((a, b) => a.time - b.time);
}

/**
 * Futures OHLCV: official GET /market_data/candlesticks?pair=&from=&to=&resolution=&pcode=f (from/to in **seconds**).
 * Falls back to GET /market_data/candles?…&startTime=&endTime= in **ms** when candlesticks returns nothing or pair is not B-*_USDT.
 */
export async function fetchPublicOhlcv(
  pair: string,
  interval: string,
  limit: number,
  options?: { signal?: AbortSignal }
): Promise<OhlcvBar[]> {
  const pairNorm = pair.trim();
  const signal = options?.signal ?? AbortSignal.timeout(10_000);
  const nowMs = Date.now();
  const resolution = FUTURES_CANDLESTICK_RESOLUTION[interval] ?? '60';
  const barMs = INTERVAL_MS[interval] ?? 3_600_000;

  if (isCoinDcxFuturesPair(pairNorm)) {
    const fromSec = Math.floor((nowMs - barMs * (limit + 2)) / 1000);
    const toSec = Math.floor(nowMs / 1000);
    const url = new URL(`${PUBLIC_BASE}/market_data/candlesticks`);
    url.searchParams.set('pair', pairNorm);
    url.searchParams.set('from', String(fromSec));
    url.searchParams.set('to', String(toSec));
    url.searchParams.set('resolution', resolution);
    url.searchParams.set('pcode', 'f');

    try {
      const res = await fetch(url.toString(), { signal });
      if (res.ok) {
        const json = (await res.json()) as { s?: string; data?: unknown[] };
        const rows = Array.isArray(json.data) ? json.data : [];
        const bars = toFiniteBars(rows);
        if (bars.length > 0) return bars;
      }
    } catch {
      /* fall through */
    }
  }

  const startTime = nowMs - barMs * (limit + 5);
  const legacy = new URL(`${PUBLIC_BASE}/market_data/candles`);
  legacy.searchParams.set('pair', pairNorm);
  legacy.searchParams.set('interval', interval);
  legacy.searchParams.set('limit', String(limit));
  legacy.searchParams.set('startTime', String(startTime));
  legacy.searchParams.set('endTime', String(nowMs));

  try {
    const res = await fetch(legacy.toString(), { signal });
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? toFiniteBars(raw) : [];
  } catch {
    return [];
  }
}

/** GET …/v3/orderbook/{instrument}-futures/{10|20|50} */
export function futuresOrderbookUrl(instrument: string, depth: 10 | 20 | 50 = 20): string {
  const inst = instrument.trim();
  return `${PUBLIC_BASE}/market_data/v3/orderbook/${encodeURIComponent(inst)}-futures/${depth}`;
}

export async function fetchFuturesOrderbookJson(
  instrument: string,
  depth: 10 | 20 | 50,
  options?: { signal?: AbortSignal }
): Promise<unknown> {
  const signal = options?.signal ?? AbortSignal.timeout(10_000);
  const res = await fetch(futuresOrderbookUrl(instrument, depth), { signal });
  if (!res.ok) throw new Error(`orderbook ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Active USDT-margined futures instruments (public). */
export async function fetchActiveFuturesInstruments(
  margin: 'USDT' | 'INR' = 'USDT',
  options?: { signal?: AbortSignal }
): Promise<unknown> {
  const signal = options?.signal ?? AbortSignal.timeout(10_000);
  const url = new URL(`${API_BASE}/exchange/v1/derivatives/futures/data/active_instruments`);
  url.searchParams.append('margin_currency_short_name[]', margin);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`active_instruments ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchFuturesInstrumentDetails(
  pair: string,
  margin: 'USDT' | 'INR' = 'USDT',
  options?: { signal?: AbortSignal }
): Promise<unknown> {
  const signal = options?.signal ?? AbortSignal.timeout(10_000);
  const url = new URL(`${API_BASE}/exchange/v1/derivatives/futures/data/instrument`);
  url.searchParams.set('pair', pair.trim());
  url.searchParams.set('margin_currency_short_name', margin);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`instrument ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchFuturesPublicTrades(
  pair: string,
  options?: { signal?: AbortSignal }
): Promise<unknown> {
  const signal = options?.signal ?? AbortSignal.timeout(10_000);
  const url = new URL(`${API_BASE}/exchange/v1/derivatives/futures/data/trades`);
  url.searchParams.set('pair', pair.trim());
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`futures trades ${res.status}: ${await res.text()}`);
  return res.json();
}
