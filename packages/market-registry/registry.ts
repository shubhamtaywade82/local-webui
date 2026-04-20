import { CoinDCXRestClient } from '@workspace/coindcx-client';
import type { FuturesInstrument } from '@workspace/coindcx-client';
import type { InstrumentMeta, RegistryDbAdapter } from './types';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function toMeta(inst: FuturesInstrument): InstrumentMeta {
  return {
    pair:              inst.pair,
    baseCurrency:      inst.baseCurrency,
    minQuantity:       inst.minQuantity,
    maxQuantity:       inst.maxQuantity,
    quantityIncrement: inst.quantityIncrement,
    priceIncrement:    inst.priceIncrement,
    maxLeverage:       inst.maxLeverage,
    minNotional:       inst.minNotional,
    status:            inst.status === 'active' ? 'active' : 'expired',
    fetchedAt:         Date.now(),
  };
}

export class MarketRegistry {
  private cache = new Map<string, InstrumentMeta>();
  private lastRefresh = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly rest = new CoinDCXRestClient();

  constructor(private db?: RegistryDbAdapter) {}

  async start(refreshEveryMs = DEFAULT_TTL_MS): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((e) =>
        console.error('[market-registry] refresh error:', e)
      );
    }, refreshEveryMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refresh(): Promise<void> {
    try {
      const active = await this.rest.fetchActiveInstruments('USDT');
      const pairs = active
        .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
        .map((a) => String(a.pair ?? a.symbol ?? ''))
        .filter(Boolean);

      await Promise.all(
        pairs.map(async (pair) => {
          try {
            const inst = await this.rest.fetchInstrumentDetails(pair, 'USDT');
            const meta = toMeta(inst);
            this.cache.set(pair, meta);
            if (this.db) {
              await this.db.saveFuturesInstrument(pair, meta.status, inst.raw);
            }
          } catch {
            // Keep stale entry if refresh fails for individual pair
          }
        }),
      );

      this.lastRefresh = Date.now();
      console.log(`[market-registry] refreshed ${this.cache.size} instruments`);
    } catch (err) {
      console.error('[market-registry] refresh failed:', err);
      // Seed from DB on first-run failure
      if (this.cache.size === 0 && this.db) {
        const rows = await this.db.listActiveFuturesInstruments();
        for (const row of rows) {
          const raw = row.metadata as Record<string, unknown>;
          this.cache.set(row.pair, {
            pair:              row.pair,
            baseCurrency:      String(raw.base_currency_short_name ?? ''),
            minQuantity:       parseFloat(String(raw.min_quantity ?? 0)),
            maxQuantity:       parseFloat(String(raw.max_quantity ?? 0)),
            quantityIncrement: parseFloat(String(raw.quantity_increment ?? 0)),
            priceIncrement:    parseFloat(String(raw.price_increment ?? 0)),
            maxLeverage:       parseFloat(String(raw.max_leverage_long ?? raw.max_leverage ?? 0)),
            minNotional:       parseFloat(String(raw.min_notional ?? 0)),
            status:            'active',
            fetchedAt:         row.updatedAt.getTime(),
          });
        }
      }
    }
  }

  getInstrument(pair: string): InstrumentMeta | null {
    return this.cache.get(pair) ?? null;
  }

  getAllActive(): InstrumentMeta[] {
    return Array.from(this.cache.values()).filter((m) => m.status === 'active');
  }

  /**
   * When the cache has no active instruments (startup race, first refresh failure, or cold DB),
   * run a single refresh so tools like get_active_futures_universe do not fail spuriously.
   */
  async ensureWarm(): Promise<void> {
    if (this.getAllActive().length > 0) return;
    await this.refresh();
  }

  isStale(pair: string, maxAgeMs = DEFAULT_TTL_MS): boolean {
    const meta = this.cache.get(pair);
    if (!meta) return true;
    return Date.now() - meta.fetchedAt > maxAgeMs;
  }
}
