import { describe, it, expect } from 'vitest';
import type { BarResult } from '../smc-engine';
import {
  deriveWatchLevelsFromBar,
  detectLevelCross,
  evaluateStrictAutomationTrade,
} from '../smc-automation-decision';

function bar(partial: Partial<BarResult> & Pick<BarResult, 'barIndex'>): BarResult {
  const base: BarResult = {
    barIndex: partial.barIndex ?? 0,
    bosBull: false,
    bosBear: false,
    chochBull: false,
    chochBear: false,
    structureBias: 0,
    inBullOb: false,
    inBearOb: false,
    bullObValid: false,
    bearObValid: false,
    bullObHi: null,
    bullObLo: null,
    bearObHi: null,
    bearObLo: null,
    recentBullSweep: false,
    recentBearSweep: false,
    liqSweepBull: false,
    liqSweepBear: false,
    msTrend: 0,
    tlBearBreak: false,
    tlBullBreak: false,
    tlBearRetest: false,
    tlBullRetest: false,
    sessLevelBull: false,
    sessLevelBear: false,
    vpBullConf: false,
    vpBearConf: false,
    nearPoc: false,
    nearVah: false,
    nearVal: false,
    longScore: 0,
    shortScore: 0,
    longSignal: false,
    shortSignal: false,
    pdhSweep: false,
    pdlSweep: false,
    pdh: null,
    pdl: null,
    poc: null,
    vah: null,
    valLine: null,
    atr14: 100,
    fvgBullAlign: false,
    fvgBearAlign: false,
    inDiscount: false,
    inPremium: false,
    activeFvgs: [],
    asiaHi: null,
    asiaLo: null,
    londonHi: null,
    londonLo: null,
  };
  return { ...base, ...partial };
}

describe('smc-automation-decision', () => {
  it('deriveWatchLevelsFromBar collects key levels', () => {
    const last = bar({
      barIndex: 1,
      pdh: 100,
      pdl: 90,
      poc: 95,
      bullObValid: true,
      bullObHi: 96,
      bullObLo: 94,
    });
    const lv = deriveWatchLevelsFromBar(last);
    expect(lv).toContain(90);
    expect(lv).toContain(95);
    expect(lv).toContain(100);
  });

  it('detectLevelCross detects upward cross', () => {
    expect(detectLevelCross(99, 101, 100)).toBe('up');
    expect(detectLevelCross(101, 99, 100)).toBe('down');
    expect(detectLevelCross(100.1, 100.2, 100)).toBe(null);
  });

  it('evaluateStrictAutomationTrade returns LONG when gates pass', () => {
    const htf = bar({ barIndex: 0, structureBias: 1 });
    const ltf = bar({
      barIndex: 1,
      structureBias: 1,
      longScore: 4,
      bullObValid: true,
      bullObHi: 102,
      bullObLo: 98,
      pdl: 90,
      pdh: 110,
    });
    const r = evaluateStrictAutomationTrade(htf, ltf, 'B-BTC_USDT', '1h', '15m', 100);
    expect(r.decision).toBe('LONG');
    expect(r.telegram?.direction).toBe('Long');
    expect(r.telegram?.stopLoss).toBeTruthy();
  });

  it('evaluateStrictAutomationTrade returns NO_TRADE when scores too low', () => {
    const htf = bar({ barIndex: 0, structureBias: 1 });
    const ltf = bar({ barIndex: 1, structureBias: 1, longScore: 2 });
    const r = evaluateStrictAutomationTrade(htf, ltf, 'B-BTC_USDT', '1h', '15m', 100);
    expect(r.decision).toBe('NO_TRADE');
    expect(r.telegram).toBeNull();
  });
});
