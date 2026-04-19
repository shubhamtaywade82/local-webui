import type { OhlcvBar } from '@workspace/coindcx-client';

export type { OhlcvBar };

export interface TimeframeSnapshot {
  pair: string;
  timeframe: string;
  candles: OhlcvBar[];
  asOf: number; // epoch ms
}

export interface TfFeatures {
  pair: string;
  timeframe: string;
  asOf: number;

  // Trend
  trendDirection: 'up' | 'down' | 'sideways';
  ema21: number;
  ema50: number;
  emaSlope: number; // (ema21[last] - ema21[prev]) / ema21[prev]

  // Volatility
  atr14: number;
  atrPct: number; // atr / close * 100

  // Volume
  volumeExpansion: boolean; // current vol > 1.5 * vol_ma20

  // Price location
  vwap: number;
  vwapDistance: number; // (close - vwap) / vwap

  // Momentum
  rsi14: number;

  // Last bar
  close: number;
  high: number;
  low: number;
}

export interface SnapshotDbAdapter {
  upsertCandleSnapshot(
    pair: string,
    timeframe: string,
    candles: unknown[],
    asOf: Date,
  ): Promise<unknown>;
  getCandleSnapshot(
    pair: string,
    timeframe: string,
  ): Promise<{ candles: unknown[]; asOf: Date } | null>;
}
