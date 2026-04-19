import type { OrderBook } from '@workspace/coindcx-client';

interface PriceEntry {
  markPrice: number;
  lastPrice: number;
  ts: number;
}

export class LivePriceCache {
  private prices    = new Map<string, PriceEntry>();
  private orderbooks = new Map<string, OrderBook>();

  setPrice(pair: string, markPrice: number, lastPrice: number): void {
    this.prices.set(pair, { markPrice, lastPrice, ts: Date.now() });
  }

  getPrice(pair: string): PriceEntry | null {
    return this.prices.get(pair) ?? null;
  }

  // Always replace the entire book — snapshot semantics (never patch).
  setOrderBook(pair: string, ob: OrderBook): void {
    this.orderbooks.set(pair, ob);
  }

  getOrderBook(pair: string): OrderBook | null {
    return this.orderbooks.get(pair) ?? null;
  }

  isStale(pair: string, maxAgeMs = 30_000): boolean {
    const entry = this.prices.get(pair);
    if (!entry) return true;
    return Date.now() - entry.ts > maxAgeMs;
  }
}

export const liveCache = new LivePriceCache();
