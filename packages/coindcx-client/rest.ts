import {
  OhlcvBar,
  FuturesInstrument,
  OrderBook,
  FUTURES_CANDLESTICK_RESOLUTION,
  INTERVAL_MS,
  isCoinDcxFuturesPair,
} from './types';

export const PUBLIC_BASE = 'https://public.coindcx.com';
export const API_BASE = 'https://api.coindcx.com';

function toFiniteBars(rows: unknown[]): OhlcvBar[] {
  return rows
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
    .map((c) => ({
      open:   parseFloat(String(c.open)),
      high:   parseFloat(String(c.high)),
      low:    parseFloat(String(c.low)),
      close:  parseFloat(String(c.close)),
      volume: parseFloat(String(c.volume ?? 0)),
      time:   typeof c.time === 'number' ? c.time : parseInt(String(c.time), 10),
    }))
    .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.time))
    .sort((a, b) => a.time - b.time);
}

function normaliseInstrument(raw: Record<string, unknown>): FuturesInstrument {
  return {
    pair:              String(raw.pair ?? raw.symbol ?? ''),
    baseCurrency:      String(raw.base_currency_short_name ?? raw.base ?? ''),
    quoteCurrency:     String(raw.quote_currency_short_name ?? raw.quote ?? 'USDT'),
    contractType:      String(raw.contract_type ?? raw.kind ?? 'perpetual'),
    status:            String(raw.status ?? 'active'),
    minQuantity:       parseFloat(String(raw.min_quantity ?? 0)),
    maxQuantity:       parseFloat(String(raw.max_quantity ?? 0)),
    quantityIncrement: parseFloat(String(raw.quantity_increment ?? raw.step_size ?? 0)),
    priceIncrement:    parseFloat(String(raw.price_increment ?? raw.tick_size ?? 0)),
    maxLeverage:       parseFloat(String(raw.max_leverage_long ?? raw.max_leverage ?? 0)),
    minNotional:       parseFloat(String(raw.min_notional ?? 0)),
    raw,
  };
}

export class CoinDCXRestClient {
  async fetchOhlcv(
    pair: string,
    interval: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<OhlcvBar[]> {
    const pairNorm = pair.trim();
    const sig = signal ?? AbortSignal.timeout(10_000);
    const nowMs = Date.now();
    const resolution = FUTURES_CANDLESTICK_RESOLUTION[interval] ?? '60';
    const barMs = INTERVAL_MS[interval] ?? 3_600_000;

    if (isCoinDcxFuturesPair(pairNorm)) {
      const fromSec = Math.floor((nowMs - barMs * (limit + 2)) / 1000);
      const toSec   = Math.floor(nowMs / 1000);
      const url = new URL(`${PUBLIC_BASE}/market_data/candlesticks`);
      url.searchParams.set('pair', pairNorm);
      url.searchParams.set('from', String(fromSec));
      url.searchParams.set('to', String(toSec));
      url.searchParams.set('resolution', resolution);
      url.searchParams.set('pcode', 'f');
      try {
        const res = await fetch(url.toString(), { signal: sig });
        if (res.ok) {
          const json = (await res.json()) as { data?: unknown[] };
          const bars = toFiniteBars(Array.isArray(json.data) ? json.data : []);
          if (bars.length > 0) return bars;
        }
      } catch { /* fall through */ }
    }

    const startTime = nowMs - barMs * (limit + 5);
    const legacy = new URL(`${PUBLIC_BASE}/market_data/candles`);
    legacy.searchParams.set('pair', pairNorm);
    legacy.searchParams.set('interval', interval);
    legacy.searchParams.set('limit', String(limit));
    legacy.searchParams.set('startTime', String(startTime));
    legacy.searchParams.set('endTime', String(nowMs));
    try {
      const res = await fetch(legacy.toString(), { signal: sig });
      if (!res.ok) return [];
      const raw = await res.json();
      return Array.isArray(raw) ? toFiniteBars(raw) : [];
    } catch {
      return [];
    }
  }

  async fetchOrderBook(
    instrument: string,
    depth: 10 | 20 | 50 = 20,
    signal?: AbortSignal,
  ): Promise<OrderBook> {
    const sig = signal ?? AbortSignal.timeout(10_000);
    const inst = instrument.trim();
    const url = `${PUBLIC_BASE}/market_data/v3/orderbook/${encodeURIComponent(inst)}-futures/${depth}`;
    const res = await fetch(url, { signal: sig });
    if (!res.ok) throw new Error(`orderbook ${res.status}: ${await res.text()}`);
    const raw = await res.json() as Record<string, unknown>;
    return {
      pair:      inst,
      bids:      (raw.bids as Record<string, string>) ?? {},
      asks:      (raw.asks as Record<string, string>) ?? {},
      timestamp: Date.now(),
    };
  }

  async fetchActiveInstruments(
    margin: 'USDT' | 'INR' = 'USDT',
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const sig = signal ?? AbortSignal.timeout(10_000);
    const url = new URL(`${API_BASE}/exchange/v1/derivatives/futures/data/active_instruments`);
    url.searchParams.append('margin_currency_short_name[]', margin);
    const res = await fetch(url.toString(), { signal: sig });
    if (!res.ok) throw new Error(`active_instruments ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async fetchInstrumentDetails(
    pair: string,
    margin: 'USDT' | 'INR' = 'USDT',
    signal?: AbortSignal,
  ): Promise<FuturesInstrument> {
    const sig = signal ?? AbortSignal.timeout(10_000);
    const url = new URL(`${API_BASE}/exchange/v1/derivatives/futures/data/instrument`);
    url.searchParams.set('pair', pair.trim());
    url.searchParams.set('margin_currency_short_name', margin);
    const res = await fetch(url.toString(), { signal: sig });
    if (!res.ok) throw new Error(`instrument ${res.status}: ${await res.text()}`);
    const raw = await res.json() as Record<string, unknown>;
    return normaliseInstrument(raw);
  }

  async fetchPublicTrades(pair: string, signal?: AbortSignal): Promise<unknown[]> {
    const sig = signal ?? AbortSignal.timeout(10_000);
    const url = new URL(`${API_BASE}/exchange/v1/derivatives/futures/data/trades`);
    url.searchParams.set('pair', pair.trim());
    const res = await fetch(url.toString(), { signal: sig });
    if (!res.ok) throw new Error(`futures trades ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async fetchFuturesRtPrices(signal?: AbortSignal): Promise<Record<string, unknown>[]> {
    const sig = signal ?? AbortSignal.timeout(10_000);
    const url = `${PUBLIC_BASE}/market_data/v3/futures_prices`;
    const res = await fetch(url, { signal: sig });
    if (!res.ok) throw new Error(`futures_prices ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async fetchSpotTicker(signal?: AbortSignal): Promise<Record<string, unknown>[]> {
    const sig = signal ?? AbortSignal.timeout(10_000);
    const url = `${API_BASE}/exchange/ticker`;
    const res = await fetch(url, { signal: sig });
    if (!res.ok) throw new Error(`spot ticker ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
}
