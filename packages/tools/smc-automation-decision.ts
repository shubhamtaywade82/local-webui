import type { BarResult } from './smc-engine';

export type AutomationTradeDecision = 'LONG' | 'SHORT' | 'NO_TRADE';

export type AutomationTelegramFields = {
  symbol: string;
  direction: 'Long' | 'Short';
  setupName: string;
  entryRange: string;
  stopLoss: string;
  takeProfit: string;
  analysisSummary: string;
  riskReward: string;
};

function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return v > 1000 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6);
}

/**
 * Watch levels from last SMC bar: session + volume nodes + OB midpoints (deduped, sorted).
 */
export function deriveWatchLevelsFromBar(last: BarResult): number[] {
  const out: number[] = [];
  const push = (v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) out.push(v);
  };
  push(last.pdh);
  push(last.pdl);
  push(last.poc);
  push(last.vah);
  push(last.valLine);
  if (last.bullObValid && last.bullObHi != null && last.bullObLo != null) {
    push((last.bullObHi + last.bullObLo) / 2);
  }
  if (last.bearObValid && last.bearObHi != null && last.bearObLo != null) {
    push((last.bearObHi + last.bearObLo) / 2);
  }
  const uniq = [...new Set(out.map((x) => Number(x.toFixed(8))))].sort((a, b) => a - b);
  return uniq.slice(0, 16);
}

export type LevelCrossKind = 'up' | 'down';

export function detectLevelCross(
  prev: number,
  curr: number,
  level: number,
  eps = 0
): LevelCrossKind | null {
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || !Number.isFinite(level)) return null;
  if (prev < level - eps && curr >= level - eps) return 'up';
  if (prev > level + eps && curr <= level + eps) return 'down';
  return null;
}

/**
 * Same strict gates as `buildTradeSetup` in smc-analysis-tool: aligned HTF/LTF bias + score ≥ 3.
 * If both LONG and SHORT qualify, picks the side with higher score; tie → NO_TRADE.
 */
export function evaluateStrictAutomationTrade(
  htfLast: BarResult,
  ltfLast: BarResult,
  pair: string,
  htfTf: string,
  ltfTf: string,
  refPrice: number
): { decision: AutomationTradeDecision; telegram: AutomationTelegramFields | null } {
  const htfBias = htfLast.structureBias;
  const longOk = htfBias >= 0 && ltfLast.structureBias === 1;
  const shortOk = htfBias <= 0 && ltfLast.structureBias === -1;
  const longQual = longOk && ltfLast.longScore >= 3;
  const shortQual = shortOk && ltfLast.shortScore >= 3;

  let decision: AutomationTradeDecision = 'NO_TRADE';
  if (longQual && shortQual) {
    if (ltfLast.longScore > ltfLast.shortScore) decision = 'LONG';
    else if (ltfLast.shortScore > ltfLast.longScore) decision = 'SHORT';
    else decision = 'NO_TRADE';
  } else if (longQual) decision = 'LONG';
  else if (shortQual) decision = 'SHORT';

  if (decision === 'NO_TRADE') {
    return { decision, telegram: null };
  }

  const atr = ltfLast.atr14 ?? refPrice * 0.002;
  const setupName = `SMC MTF ${ltfTf} touch — ${decision}`;

  if (decision === 'LONG') {
    const entryMid = ltfLast.bullObValid && ltfLast.bullObHi != null && ltfLast.bullObLo != null
      ? (ltfLast.bullObHi + ltfLast.bullObLo) / 2
      : refPrice;
    const entryRange = ltfLast.bullObValid && ltfLast.bullObHi != null && ltfLast.bullObLo != null
      ? `${fmtPrice(ltfLast.bullObLo)} – ${fmtPrice(ltfLast.bullObHi)}`
      : `near ${fmtPrice(refPrice)}`;
    const slNum =
      ltfLast.pdl != null && Number.isFinite(ltfLast.pdl)
        ? Math.min(ltfLast.pdl - atr * 0.05, entryMid - atr * 0.25)
        : entryMid - atr * 1.5;
    const risk = Math.max(entryMid - slNum, atr * 0.1);
    const tp1 = entryMid + risk * 2;
    const tpStretch = ltfLast.pdh != null ? fmtPrice(ltfLast.pdh) : fmtPrice(tp1 + risk);
    const reasons: string[] = [];
    if (ltfLast.inBullOb) reasons.push('price in bull OB');
    if (ltfLast.recentBullSweep) reasons.push('recent liquidity sweep');
    if (ltfLast.vpBullConf) reasons.push('vol profile support');
    if (ltfLast.sessLevelBull) reasons.push('session support');
    if (ltfLast.tlBearRetest) reasons.push('bear TL retest');
    if (ltfLast.fvgBullAlign) reasons.push('bullish FVG');
    if (ltfLast.inDiscount) reasons.push('discount');
    const analysisSummary = [
      `HTF ${htfTf} bias ≥0, LTF ${ltfTf} bullish structure, longScore=${ltfLast.longScore}/8`,
      reasons.length ? `Confluence: ${reasons.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      decision,
      telegram: {
        symbol: pair,
        direction: 'Long',
        setupName,
        entryRange,
        stopLoss: fmtPrice(slNum),
        takeProfit: `TP1 ${fmtPrice(tp1)} (≈2R) | stretch ${tpStretch}`,
        analysisSummary,
        riskReward: '≥2.0 (TP1 vs entry–SL)',
      },
    };
  }

  const entryMid =
    ltfLast.bearObValid && ltfLast.bearObHi != null && ltfLast.bearObLo != null
      ? (ltfLast.bearObHi + ltfLast.bearObLo) / 2
      : refPrice;
  const entryRange =
    ltfLast.bearObValid && ltfLast.bearObHi != null && ltfLast.bearObLo != null
      ? `${fmtPrice(ltfLast.bearObLo)} – ${fmtPrice(ltfLast.bearObHi)}`
      : `near ${fmtPrice(refPrice)}`;
  const slNum =
    ltfLast.pdh != null && Number.isFinite(ltfLast.pdh)
      ? Math.max(ltfLast.pdh + atr * 0.05, entryMid + atr * 0.25)
      : entryMid + atr * 1.5;
  const risk = Math.max(slNum - entryMid, atr * 0.1);
  const tp1 = entryMid - risk * 2;
  const tpStretch = ltfLast.pdl != null ? fmtPrice(ltfLast.pdl) : fmtPrice(tp1 - risk);
  const reasons: string[] = [];
  if (ltfLast.inBearOb) reasons.push('price in bear OB');
  if (ltfLast.recentBearSweep) reasons.push('recent liquidity sweep');
  if (ltfLast.vpBearConf) reasons.push('vol profile resistance');
  if (ltfLast.sessLevelBear) reasons.push('session resistance');
  if (ltfLast.tlBullRetest) reasons.push('bull TL retest');
  if (ltfLast.fvgBearAlign) reasons.push('bearish FVG');
  if (ltfLast.inPremium) reasons.push('premium');
  const analysisSummary = [
    `HTF ${htfTf} bias ≤0, LTF ${ltfTf} bearish structure, shortScore=${ltfLast.shortScore}/8`,
    reasons.length ? `Confluence: ${reasons.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    decision,
    telegram: {
      symbol: pair,
      direction: 'Short',
      setupName,
      entryRange,
      stopLoss: fmtPrice(slNum),
      takeProfit: `TP1 ${fmtPrice(tp1)} (≈2R) | stretch ${tpStretch}`,
      analysisSummary,
      riskReward: '≥2.0 (TP1 vs SL–entry)',
    },
  };
}
