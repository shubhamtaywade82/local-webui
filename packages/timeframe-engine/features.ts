import type { OhlcvBar, TfFeatures, TimeframeSnapshot } from './types';

export function computeEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    emas.push(prices[i] * k + emas[i - 1] * (1 - k));
  }
  return emas;
}

export function computeATR(candles: OhlcvBar[], period: number): number[] {
  if (candles.length < 2) return [];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    trs.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev),
      Math.abs(c.low  - prev),
    ));
  }
  // Wilder smoothing
  const atrs: number[] = [];
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  atrs.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    atrs.push(atr);
  }
  return atrs;
}

export function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains  += diff;
    else           losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeVWAP(candles: OhlcvBar[]): number {
  let cumTpv = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTpv += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol === 0 ? candles.at(-1)?.close ?? 0 : cumTpv / cumVol;
}

export function computeEmaSlope(emas: number[]): number {
  const n = emas.length;
  if (n < 2) return 0;
  const prev = emas[n - 2];
  return prev === 0 ? 0 : (emas[n - 1] - prev) / prev;
}

export function extractFeatures(snapshot: TimeframeSnapshot): TfFeatures {
  const { pair, timeframe, candles, asOf } = snapshot;
  const closes  = candles.map((c) => c.close);
  const n = closes.length;

  const ema21Arr = computeEMA(closes, 21);
  const ema50Arr = computeEMA(closes, 50);
  const ema21    = ema21Arr.at(-1) ?? 0;
  const ema50    = ema50Arr.at(-1) ?? 0;
  const slope    = computeEmaSlope(ema21Arr);

  const atrArr = computeATR(candles, 14);
  const atr14  = atrArr.at(-1) ?? 0;
  const close  = closes.at(-1) ?? 0;
  const atrPct = close === 0 ? 0 : (atr14 / close) * 100;

  // Volume expansion: current bar vs 20-bar MA
  const volumes = candles.map((c) => c.volume);
  const volMa20 = n >= 20
    ? volumes.slice(-20).reduce((s, v) => s + v, 0) / 20
    : volumes.reduce((s, v) => s + v, 0) / (n || 1);
  const volumeExpansion = volumes.at(-1)! > volMa20 * 1.5;

  const vwap         = computeVWAP(candles);
  const vwapDistance = vwap === 0 ? 0 : (close - vwap) / vwap;

  const rsi14 = computeRSI(closes, 14);

  let trendDirection: 'up' | 'down' | 'sideways';
  if      (ema21 > ema50 && slope > 0) trendDirection = 'up';
  else if (ema21 < ema50 && slope < 0) trendDirection = 'down';
  else                                  trendDirection = 'sideways';

  return {
    pair, timeframe, asOf,
    trendDirection,
    ema21, ema50, emaSlope: slope,
    atr14, atrPct,
    volumeExpansion,
    vwap, vwapDistance,
    rsi14,
    close,
    high: candles.at(-1)?.high ?? 0,
    low:  candles.at(-1)?.low  ?? 0,
  };
}
