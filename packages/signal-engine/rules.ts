import type { TfFeatures } from '@workspace/timeframe-engine';
import type { Direction, SmcContext, TradeSignal } from './types';

// 4h/1h regime: require aligned trend + RSI not extreme against direction
export function determineRegime(htf4h: TfFeatures, htf1h: TfFeatures): Direction | null {
  const bullish4h = htf4h.trendDirection === 'up';
  const bearish4h = htf4h.trendDirection === 'down';
  const bullish1h = htf1h.trendDirection === 'up';
  const bearish1h = htf1h.trendDirection === 'down';

  if (bullish4h && bullish1h && htf4h.rsi14 < 80 && htf1h.rsi14 < 80) return 'long';
  if (bearish4h && bearish1h && htf4h.rsi14 > 20 && htf1h.rsi14 > 20) return 'short';
  return null;
}

// 15m structure: confirm price is in a relevant SMC zone for the regime
export function checkStructure(
  tf15m: TfFeatures,
  smcCtx: SmcContext,
  regime: Direction,
): boolean {
  if (regime === 'long') {
    return smcCtx.structureBias >= 0 && (smcCtx.inBullOb || smcCtx.recentBullSweep);
  }
  return smcCtx.structureBias <= 0 && (smcCtx.inBearOb || smcCtx.recentBearSweep);
}

// 5m trigger: SMC scored high enough + momentum alignment
export function checkTrigger(
  tf5m: TfFeatures,
  smcCtx: SmcContext,
  regime: Direction,
): boolean {
  const MIN_SCORE = 3;
  if (regime === 'long') {
    return (
      smcCtx.longScore >= MIN_SCORE &&
      tf5m.rsi14 > 30 &&
      tf5m.rsi14 < 70 &&
      tf5m.emaSlope > 0
    );
  }
  return (
    smcCtx.shortScore >= MIN_SCORE &&
    tf5m.rsi14 > 30 &&
    tf5m.rsi14 < 70 &&
    tf5m.emaSlope < 0
  );
}

// 1m validation: price hasn't already run away from the entry zone
export function validateEntry(tf1m: TfFeatures, direction: Direction): boolean {
  // Accept entry if VWAP distance isn't too far (within 0.5%)
  return Math.abs(tf1m.vwapDistance) < 0.005;
}

export function computeSlTp(
  direction: Direction,
  entry: number,
  smcCtx: SmcContext,
  atr: number,
): { stopLoss: number; takeProfit: number } {
  const atrSl = atr * 1.5;
  const atrTp = atr * 3.0;

  if (direction === 'long') {
    const obSl  = smcCtx.bullObLo != null ? smcCtx.bullObLo - atr * 0.3 : null;
    const stopLoss  = obSl != null ? Math.min(entry - atrSl, obSl) : entry - atrSl;
    const takeProfit = entry + atrTp;
    return { stopLoss, takeProfit };
  }

  const obSl  = smcCtx.bearObHi != null ? smcCtx.bearObHi + atr * 0.3 : null;
  const stopLoss  = obSl != null ? Math.max(entry + atrSl, obSl) : entry + atrSl;
  const takeProfit = entry - atrTp;
  return { stopLoss, takeProfit };
}

export function computeConfidence(
  smcLongScore: number,
  smcShortScore: number,
  direction: Direction,
  regime: Direction,
): number {
  const score = direction === 'long' ? smcLongScore : smcShortScore;
  const regimeBonus = direction === regime ? 0.1 : 0;
  // Score 3/8 = 0.375 min, 8/8 = 1.0 max
  return Math.min(1, score / 8 + regimeBonus);
}

export function buildReasons(
  direction: Direction,
  regime: Direction,
  tf4h: TfFeatures,
  tf1h: TfFeatures,
  tf15m: TfFeatures,
  smcCtx: SmcContext,
): string[] {
  const reasons: string[] = [];
  reasons.push(`4h trend: ${tf4h.trendDirection}, RSI ${tf4h.rsi14.toFixed(0)}`);
  reasons.push(`1h trend: ${tf1h.trendDirection}, RSI ${tf1h.rsi14.toFixed(0)}`);
  if (smcCtx.inBullOb) reasons.push('Price in bullish order block');
  if (smcCtx.inBearOb) reasons.push('Price in bearish order block');
  if (smcCtx.recentBullSweep) reasons.push('Recent bullish liquidity sweep');
  if (smcCtx.recentBearSweep) reasons.push('Recent bearish liquidity sweep');
  if (tf15m.volumeExpansion) reasons.push('Volume expansion on 15m');
  reasons.push(
    `SMC score: long=${smcCtx.longScore} short=${smcCtx.shortScore}`,
  );
  return reasons;
}
