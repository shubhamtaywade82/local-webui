import { CoinDCXRestClient } from '@workspace/coindcx-client';
import type { OhlcvBar } from '@workspace/coindcx-client';
import type { TimeframeSnapshot, TfFeatures, SnapshotDbAdapter } from './types';
import { extractFeatures } from './features';

const DEFAULT_TIMEFRAMES = ['4h', '1h', '15m', '5m', '1m'] as const;
const DEFAULT_LIMIT = 200;

export class TimeframeEngine {
  private snapshotCache = new Map<string, TimeframeSnapshot>();
  private readonly rest = new CoinDCXRestClient();

  constructor(private db?: SnapshotDbAdapter) {}

  async fetchSnapshot(
    pair: string,
    tf: string,
    limit = DEFAULT_LIMIT,
  ): Promise<TimeframeSnapshot> {
    const candles: OhlcvBar[] = await this.rest.fetchOhlcv(pair, tf, limit);
    const snapshot: TimeframeSnapshot = { pair, timeframe: tf, candles, asOf: Date.now() };
    this.snapshotCache.set(`${pair}:${tf}`, snapshot);
    if (this.db) {
      await this.db.upsertCandleSnapshot(pair, tf, candles, new Date());
    }
    return snapshot;
  }

  async getSnapshot(pair: string, tf: string): Promise<TimeframeSnapshot> {
    const key = `${pair}:${tf}`;
    const cached = this.snapshotCache.get(key);
    // Serve cache if < 60 s old
    if (cached && Date.now() - cached.asOf < 60_000) return cached;

    // Try DB
    if (this.db) {
      const row = await this.db.getCandleSnapshot(pair, tf);
      if (row && Date.now() - row.asOf.getTime() < 60_000) {
        const snapshot: TimeframeSnapshot = {
          pair, timeframe: tf,
          candles: row.candles as OhlcvBar[],
          asOf: row.asOf.getTime(),
        };
        this.snapshotCache.set(key, snapshot);
        return snapshot;
      }
    }

    return this.fetchSnapshot(pair, tf);
  }

  getFeatures(snapshot: TimeframeSnapshot): TfFeatures {
    return extractFeatures(snapshot);
  }

  async refresh(
    pair: string,
    timeframes: string[] = [...DEFAULT_TIMEFRAMES],
  ): Promise<Map<string, TfFeatures>> {
    const result = new Map<string, TfFeatures>();
    await Promise.all(
      timeframes.map(async (tf) => {
        const snap = await this.fetchSnapshot(pair, tf);
        result.set(tf, this.getFeatures(snap));
      }),
    );
    return result;
  }

  // Returns pre-computed features for 4h/1h/15m/5m — raw candles never exposed.
  async getMultiTfContext(
    pair: string,
  ): Promise<Record<string, TfFeatures>> {
    const tfs = ['4h', '1h', '15m', '5m'];
    const entries = await Promise.all(
      tfs.map(async (tf) => {
        const snap = await this.getSnapshot(pair, tf);
        return [tf, this.getFeatures(snap)] as [string, TfFeatures];
      }),
    );
    return Object.fromEntries(entries);
  }
}
