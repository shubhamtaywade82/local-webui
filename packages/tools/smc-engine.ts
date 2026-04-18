// SMC (Smart Money Concepts) engine — TypeScript port of coindcx_futures_bot/smc_confluence/engine.rb
// Pine Script v6 parity. Bar-by-bar stateful replay.

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number; // epoch ms
}

export interface SmcConfig {
  smcSwing: number;        // pivot swing length (default 10)
  obBodyPct: number;       // min impulse body % for OB (default 0.3)
  obExpire: number;        // OB expiry in bars (default 50)
  liqLookback: number;     // liquidity sweep lookback (default 20)
  liqWickPct: number;      // sweep wick tolerance % (default 0.1)
  msSwing: number;         // market structure swing (default 10)
  tlPivotLen: number;      // trendline pivot length (default 10)
  tlRetestPct: number;     // trendline retest tolerance % (default 0.15)
  vpBars: number;          // volume profile lookback bars (default 100)
  pocZonePct: number;      // POC proximity % (default 0.2)
  sessLiqPct: number;      // session level proximity % (default 0.1)
  minScore: number;        // min confluence score to signal (default 3)
  sigCooldown: number;     // bars between signals (default 5)
  atrPeriod: number;       // ATR period (default 14)
  bosRelaxed: boolean;     // BOS counts as primary trigger (default false)
  fvgConfluence: boolean;  // include FVG in scoring (default false)
  pdLookback: number | null; // premium/discount lookback (default null=off)
}

export const DEFAULT_CONFIG: SmcConfig = {
  smcSwing: 10, obBodyPct: 0.3, obExpire: 50, liqLookback: 20, liqWickPct: 0.1,
  msSwing: 10, tlPivotLen: 10, tlRetestPct: 0.15, vpBars: 100,
  pocZonePct: 0.2, sessLiqPct: 0.1, minScore: 3, sigCooldown: 5, atrPeriod: 14,
  bosRelaxed: false, fvgConfluence: false, pdLookback: null,
};

interface Fvg {
  side: 'bullish' | 'bearish';
  gapLow: number;
  gapHigh: number;
}

interface State {
  structureBias: number;
  lastPh: number | null; lastPl: number | null;
  lastPhBar: number; lastPlBar: number;
  phAge: number; plAge: number;
  bullObHi: number | null; bullObLo: number | null; bullObBar: number; bullObAge: number;
  bearObHi: number | null; bearObLo: number | null; bearObBar: number; bearObAge: number;
  lastBullSweepBar: number; lastBearSweepBar: number;
  prevMsPh: number | null; prevMsPl: number | null;
  lastMsPhVal: number | null; lastMsPlVal: number | null;
  lastMsPhBar: number; lastMsPlBar: number;
  msTrend: number;
  tlPh1: number | null; tlPh1Bar: number; tlPh2: number | null; tlPh2Bar: number;
  tlPl1: number | null; tlPl1Bar: number; tlPl2: number | null; tlPl2Bar: number;
  tlBearBroken: boolean; tlBearRetested: boolean; tlBearBreakBar: number;
  tlBullBroken: boolean; tlBullRetested: boolean; tlBullBreakBar: number;
  dayHigh: number | null; dayLow: number | null;
  pdh: number | null; pdl: number | null;
  asiaHi: number | null; asiaLo: number | null;
  londonHi: number | null; londonLo: number | null;
  nyHi: number | null; nyLo: number | null;
  wasAsia: boolean; wasLondon: boolean; wasNy: boolean;
  lastSigBar: number;
  prevCalendarDate: string | null;
  prevLiqLo: number | null; prevLiqHi: number | null;
  prevTlBearVal: number | null; prevTlBullVal: number | null;
  atrPrev: number | null;
  activeFvgs: Fvg[];
}

function initState(): State {
  return {
    structureBias: 0, lastPh: null, lastPl: null, lastPhBar: -999, lastPlBar: -999,
    phAge: 0, plAge: 0,
    bullObHi: null, bullObLo: null, bullObBar: -999, bullObAge: 0,
    bearObHi: null, bearObLo: null, bearObBar: -999, bearObAge: 0,
    lastBullSweepBar: -999, lastBearSweepBar: -999,
    prevMsPh: null, prevMsPl: null, lastMsPhVal: null, lastMsPlVal: null,
    lastMsPhBar: -999, lastMsPlBar: -999, msTrend: 0,
    tlPh1: null, tlPh1Bar: -999, tlPh2: null, tlPh2Bar: -999,
    tlPl1: null, tlPl1Bar: -999, tlPl2: null, tlPl2Bar: -999,
    tlBearBroken: false, tlBearRetested: false, tlBearBreakBar: -999,
    tlBullBroken: false, tlBullRetested: false, tlBullBreakBar: -999,
    dayHigh: null, dayLow: null, pdh: null, pdl: null,
    asiaHi: null, asiaLo: null, londonHi: null, londonLo: null, nyHi: null, nyLo: null,
    wasAsia: false, wasLondon: false, wasNy: false,
    lastSigBar: -999, prevCalendarDate: null,
    prevLiqLo: null, prevLiqHi: null, prevTlBearVal: null, prevTlBullVal: null,
    atrPrev: null, activeFvgs: [],
  };
}

export interface BarResult {
  barIndex: number;
  bosBull: boolean; bosBear: boolean;
  chochBull: boolean; chochBear: boolean;
  structureBias: number;
  inBullOb: boolean; inBearOb: boolean;
  bullObValid: boolean; bearObValid: boolean;
  bullObHi: number | null; bullObLo: number | null;
  bearObHi: number | null; bearObLo: number | null;
  recentBullSweep: boolean; recentBearSweep: boolean;
  liqSweepBull: boolean; liqSweepBear: boolean;
  msTrend: number;
  tlBearBreak: boolean; tlBullBreak: boolean;
  tlBearRetest: boolean; tlBullRetest: boolean;
  sessLevelBull: boolean; sessLevelBear: boolean;
  vpBullConf: boolean; vpBearConf: boolean;
  nearPoc: boolean; nearVah: boolean; nearVal: boolean;
  longScore: number; shortScore: number;
  longSignal: boolean; shortSignal: boolean;
  pdhSweep: boolean; pdlSweep: boolean;
  pdh: number | null; pdl: number | null;
  poc: number | null; vah: number | null; valLine: number | null;
  atr14: number | null;
  fvgBullAlign: boolean; fvgBearAlign: boolean;
  inDiscount: boolean; inPremium: boolean;
  activeFvgs: Fvg[];
  asiaHi: number | null; asiaLo: number | null;
  londonHi: number | null; londonLo: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pivotHigh(candles: Candle[], i: number, swing: number): number | null {
  if (i < swing * 2) return null;
  const mid = i - swing;
  if (mid < swing) return null;
  const hMid = candles[mid].high;
  for (let j = mid - swing; j < mid; j++) if (candles[j].high >= hMid) return null;
  for (let j = mid + 1; j <= i; j++) if (candles[j].high > hMid) return null;
  return hMid;
}

function pivotLow(candles: Candle[], i: number, swing: number): number | null {
  if (i < swing * 2) return null;
  const mid = i - swing;
  if (mid < swing) return null;
  const lMid = candles[mid].low;
  for (let j = mid - swing; j < mid; j++) if (candles[j].low <= lMid) return null;
  for (let j = mid + 1; j <= i; j++) if (candles[j].low < lMid) return null;
  return lMid;
}

function rollingHighLow(candles: Candle[], i: number, lookback: number): [number, number] {
  const from = Math.max(0, i - lookback + 1);
  let hi = -Infinity, lo = Infinity;
  for (let j = from; j <= i; j++) {
    if (candles[j].high > hi) hi = candles[j].high;
    if (candles[j].low < lo) lo = candles[j].low;
  }
  return [hi, lo];
}

function fvgAt(candles: Candle[], i: number): Fvg | null {
  if (i < 2) return null;
  const h1 = candles[i - 2].high, l1 = candles[i - 2].low;
  const h3 = candles[i].high, l3 = candles[i].low;
  if (h1 < l3) return { side: 'bullish', gapLow: h1, gapHigh: l3 };
  if (l1 > h3) return { side: 'bearish', gapLow: h3, gapHigh: l1 };
  return null;
}

function fvgInvalidated(fvg: Fvg, high: number, low: number): boolean {
  return fvg.side === 'bullish' ? low <= fvg.gapLow : high >= fvg.gapHigh;
}

function fvgOverlaps(fvg: Fvg, high: number, low: number): boolean {
  return low <= fvg.gapHigh && high >= fvg.gapLow;
}

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function runSmcEngine(candles: Candle[], cfg: Partial<SmcConfig> = {}): BarResult[] {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  const s = initState();
  const results: BarResult[] = [];

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    const { high, low, open, close, volume, time } = bar;
    const prevClose = i > 0 ? candles[i - 1].close : close;
    const prevOpen = i > 0 ? candles[i - 1].open : open;

    // ATR (Wilder smoothing)
    const prevC = i > 0 ? candles[i - 1].close : close;
    const tr = i === 0 ? high - low : Math.max(high - low, Math.abs(high - prevC), Math.abs(low - prevC));
    s.atrPrev = i === 0 || s.atrPrev === null ? tr : (s.atrPrev * (c.atrPeriod - 1) + tr) / c.atrPeriod;

    // Calendar + sessions
    const date = isoDate(time);
    const hour = new Date(time).getUTCHours();
    if (s.prevCalendarDate && date !== s.prevCalendarDate) {
      s.pdh = s.dayHigh; s.pdl = s.dayLow;
      s.dayHigh = high; s.dayLow = low;
    } else if (s.dayHigh === null) {
      s.dayHigh = high; s.dayLow = low;
    } else {
      s.dayHigh = Math.max(s.dayHigh, high);
      s.dayLow = Math.min(s.dayLow ?? low, low);
    }
    s.prevCalendarDate = date;

    const inAsia = hour >= 0 && hour < 8;
    const inLondon = hour >= 8 && hour < 16;
    const inNy = hour >= 13 && hour < 21;
    if (inAsia) { s.asiaHi = s.asiaHi === null || !s.wasAsia ? high : Math.max(s.asiaHi, high); s.asiaLo = s.asiaLo === null || !s.wasAsia ? low : Math.min(s.asiaLo, low); s.wasAsia = true; } else if (s.wasAsia) s.wasAsia = false;
    if (inLondon) { s.londonHi = s.londonHi === null || !s.wasLondon ? high : Math.max(s.londonHi, high); s.londonLo = s.londonLo === null || !s.wasLondon ? low : Math.min(s.londonLo, low); s.wasLondon = true; } else if (s.wasLondon) s.wasLondon = false;
    if (inNy) { s.nyHi = s.nyHi === null || !s.wasNy ? high : Math.max(s.nyHi, high); s.nyLo = s.nyLo === null || !s.wasNy ? low : Math.min(s.nyLo, low); s.wasNy = true; } else if (s.wasNy) s.wasNy = false;

    // Layer 1A: Pivots
    s.phAge++; s.plAge++;
    const phVal = pivotHigh(candles, i, c.smcSwing);
    const plVal = pivotLow(candles, i, c.smcSwing);
    if (phVal !== null) { s.lastPh = phVal; s.lastPhBar = i - c.smcSwing; s.phAge = 0; }
    if (plVal !== null) { s.lastPl = plVal; s.lastPlBar = i - c.smcSwing; s.plAge = 0; }

    const phValid = s.lastPh !== null && s.phAge <= c.obExpire;
    const plValid = s.lastPl !== null && s.plAge <= c.obExpire;

    const bosBull = phValid && close > s.lastPh! && prevClose <= s.lastPh!;
    const bosBear = plValid && close < s.lastPl! && prevClose >= s.lastPl!;
    const chochBull = bosBull && s.structureBias === -1;
    const chochBear = bosBear && s.structureBias === 1;

    if (bosBull || chochBull) s.structureBias = 1;
    else if (bosBear || chochBear) s.structureBias = -1;

    // Layer 1C: Order blocks
    s.bullObAge++; s.bearObAge++;
    const impulseBodyPct = close !== 0 ? (Math.abs(close - open) / Math.abs(close)) * 100 : 0;
    if (i > 0) {
      if ((bosBull || chochBull) && impulseBodyPct >= c.obBodyPct && prevClose < prevOpen) {
        s.bullObHi = candles[i - 1].high; s.bullObLo = candles[i - 1].low;
        s.bullObBar = i - 1; s.bullObAge = 0;
      }
      if ((bosBear || chochBear) && impulseBodyPct >= c.obBodyPct && prevClose > prevOpen) {
        s.bearObHi = candles[i - 1].high; s.bearObLo = candles[i - 1].low;
        s.bearObBar = i - 1; s.bearObAge = 0;
      }
    }
    const bullObValid = s.bullObHi !== null && s.bullObAge <= c.obExpire && close >= s.bullObLo! * 0.998;
    const bearObValid = s.bearObHi !== null && s.bearObAge <= c.obExpire && close <= s.bearObHi! * 1.002;
    const inBullOb = bullObValid && low <= s.bullObHi! && high >= s.bullObLo!;
    const inBearOb = bearObValid && high >= s.bearObLo! && low <= s.bearObHi!;

    // Layer 1D: Liquidity sweeps
    const [liqHi, liqLo] = rollingHighLow(candles, i, c.liqLookback);
    const wickTol = (v: number) => v * (c.liqWickPct / 100);
    const liqSweepBull = s.prevLiqLo !== null && low < s.prevLiqLo - wickTol(s.prevLiqLo) && close > s.prevLiqLo;
    const liqSweepBear = s.prevLiqHi !== null && high > s.prevLiqHi + wickTol(s.prevLiqHi) && close < s.prevLiqHi;
    if (liqSweepBull) s.lastBullSweepBar = i;
    if (liqSweepBear) s.lastBearSweepBar = i;
    const recentBullSweep = (i - s.lastBullSweepBar) <= c.smcSwing * 2;
    const recentBearSweep = (i - s.lastBearSweepBar) <= c.smcSwing * 2;

    // Layer 2: Market structure
    const msPh = pivotHigh(candles, i, c.msSwing);
    const msPl = pivotLow(candles, i, c.msSwing);
    const msHh = msPh !== null && s.prevMsPh !== null && msPh > s.prevMsPh;
    const msLh = msPh !== null && s.prevMsPh !== null && msPh < s.prevMsPh;
    const msHl = msPl !== null && s.prevMsPl !== null && msPl > s.prevMsPl;
    const msLl = msPl !== null && s.prevMsPl !== null && msPl < s.prevMsPl;
    if (msPh !== null) { s.prevMsPh = s.lastMsPhVal; s.lastMsPhVal = msPh; s.lastMsPhBar = i - c.msSwing; }
    if (msPl !== null) { s.prevMsPl = s.lastMsPlVal; s.lastMsPlVal = msPl; s.lastMsPlBar = i - c.msSwing; }
    if (msHh || msHl) s.msTrend = 1;
    if (msLh || msLl) s.msTrend = -1;

    // Layer 3: Trendlines
    const tlPh = pivotHigh(candles, i, c.tlPivotLen);
    const tlPl = pivotLow(candles, i, c.tlPivotLen);
    if (tlPh !== null) { s.tlPh2 = s.tlPh1; s.tlPh2Bar = s.tlPh1Bar; s.tlPh1 = tlPh; s.tlPh1Bar = i - c.tlPivotLen; s.tlBearBroken = false; s.tlBearRetested = false; s.tlBearBreakBar = -999; }
    if (tlPl !== null) { s.tlPl2 = s.tlPl1; s.tlPl2Bar = s.tlPl1Bar; s.tlPl1 = tlPl; s.tlPl1Bar = i - c.tlPivotLen; s.tlBullBroken = false; s.tlBullRetested = false; s.tlBullBreakBar = -999; }

    const bearSlope = (s.tlPh1 !== null && s.tlPh2 !== null && s.tlPh1Bar !== s.tlPh2Bar) ? (s.tlPh1 - s.tlPh2) / (s.tlPh1Bar - s.tlPh2Bar) : null;
    const bullSlope = (s.tlPl1 !== null && s.tlPl2 !== null && s.tlPl1Bar !== s.tlPl2Bar) ? (s.tlPl1 - s.tlPl2) / (s.tlPl1Bar - s.tlPl2Bar) : null;
    const tlBearVal = bearSlope !== null && s.tlPh1 !== null ? s.tlPh1 + bearSlope * (i - s.tlPh1Bar) : null;
    const tlBullVal = bullSlope !== null && s.tlPl1 !== null ? s.tlPl1 + bullSlope * (i - s.tlPl1Bar) : null;

    const tlBearBreak = tlBearVal !== null && s.prevTlBearVal !== null && close > tlBearVal && prevClose <= s.prevTlBearVal;
    const tlBullBreak = tlBullVal !== null && s.prevTlBullVal !== null && close < tlBullVal && prevClose >= s.prevTlBullVal;
    if (tlBearBreak) { s.tlBearBroken = true; s.tlBearRetested = false; s.tlBearBreakBar = i; }
    if (tlBullBreak) { s.tlBullBroken = true; s.tlBullRetested = false; s.tlBullBreakBar = i; }

    const proxPct = (a: number, b: number) => (Math.abs(a - b) / Math.abs(a)) * 100;
    const tlBearRetest = s.tlBearBroken && !s.tlBearRetested && tlBearVal !== null && (i - s.tlBearBreakBar) > 1 && proxPct(close, tlBearVal) <= c.tlRetestPct && close > tlBearVal;
    const tlBullRetest = s.tlBullBroken && !s.tlBullRetested && tlBullVal !== null && (i - s.tlBullBreakBar) > 1 && proxPct(close, tlBullVal) <= c.tlRetestPct && close < tlBullVal;
    if (tlBearRetest) s.tlBearRetested = true;
    if (tlBullRetest) s.tlBullRetested = true;

    // Layer 4: Session levels
    const nearLevel = (val: number | null) => val !== null && proxPct(close, val) <= c.sessLiqPct;
    const pct = c.sessLiqPct / 100;
    const pdhSweep = s.pdh !== null && high > s.pdh * (1 + pct) && close < s.pdh;
    const pdlSweep = s.pdl !== null && low < s.pdl * (1 - pct) && close > s.pdl;
    const sessLevelBull = nearLevel(s.pdl) || nearLevel(s.asiaLo) || nearLevel(s.londonLo) || pdlSweep;
    const sessLevelBear = nearLevel(s.pdh) || nearLevel(s.asiaHi) || nearLevel(s.londonHi) || pdhSweep;

    // Layer 5: Volume profile (POC, VAH, VAL via VWAP ± 1σ)
    let poc: number | null = null, vah: number | null = null, valLine: number | null = null;
    let vpBullConf = false, vpBearConf = false, nearPoc = false, nearVah = false, nearVal = false;
    if (i + 1 >= c.vpBars) {
      const from = i - c.vpBars + 1;
      let maxVol = 0, maxVolPrice = close;
      let vwapSum = 0, volTotal = 0, vwsum2 = 0;
      for (let j = from; j <= i; j++) {
        const vol = candles[j].volume || 0;
        const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
        if (vol > maxVol) { maxVol = vol; maxVolPrice = tp; }
        vwapSum += tp * vol; volTotal += vol; vwsum2 += tp * tp * vol;
      }
      if (volTotal > 0) {
        poc = maxVolPrice;
        const vwapVal = vwapSum / volTotal;
        const variance = (vwsum2 / volTotal) - (vwapVal * vwapVal);
        const sigma = variance > 0 ? Math.sqrt(variance) : (s.atrPrev ?? 0);
        vah = vwapVal + sigma; valLine = vwapVal - sigma;
        nearPoc = proxPct(close, poc) <= c.pocZonePct;
        nearVah = proxPct(close, vah) <= c.pocZonePct;
        nearVal = proxPct(close, valLine) <= c.pocZonePct;
        vpBullConf = nearPoc || nearVal;
        vpBearConf = nearPoc || nearVah;
      }
    }

    // FVG
    let fvgBullAlign = false, fvgBearAlign = false;
    if (c.fvgConfluence) {
      s.activeFvgs = s.activeFvgs.filter(f => !fvgInvalidated(f, high, low));
      const nf = fvgAt(candles, i);
      if (nf) s.activeFvgs.push(nf);
      fvgBullAlign = s.activeFvgs.some(f => f.side === 'bullish' && fvgOverlaps(f, high, low));
      fvgBearAlign = s.activeFvgs.some(f => f.side === 'bearish' && fvgOverlaps(f, high, low));
    } else {
      s.activeFvgs = [];
    }

    // Premium / Discount
    let inDiscount = false, inPremium = false;
    if (c.pdLookback && c.pdLookback > 0) {
      const [rHi, rLo] = rollingHighLow(candles, i, c.pdLookback);
      const mid = (rHi + rLo) / 2;
      inDiscount = close < mid;
      inPremium = close > mid;
    }

    // Confluence scores
    const longS1 = (c.bosRelaxed ? (chochBull || bosBull) : chochBull) ? 1 : 0;
    const longScore = longS1 + (inBullOb ? 1 : 0) + (recentBullSweep ? 1 : 0) + (vpBullConf ? 1 : 0) + (sessLevelBull ? 1 : 0) + (tlBearRetest ? 1 : 0) + (c.fvgConfluence && fvgBullAlign ? 1 : 0) + (c.pdLookback && inDiscount ? 1 : 0);
    const shortS1 = (c.bosRelaxed ? (chochBear || bosBear) : chochBear) ? 1 : 0;
    const shortScore = shortS1 + (inBearOb ? 1 : 0) + (recentBearSweep ? 1 : 0) + (vpBearConf ? 1 : 0) + (sessLevelBear ? 1 : 0) + (tlBullRetest ? 1 : 0) + (c.fvgConfluence && fvgBearAlign ? 1 : 0) + (c.pdLookback && inPremium ? 1 : 0);
    const cooldownOk = (i - s.lastSigBar) >= c.sigCooldown;
    const longSignal = longS1 === 1 && longScore >= c.minScore && cooldownOk;
    const shortSignal = shortS1 === 1 && shortScore >= c.minScore && cooldownOk;
    if (longSignal || shortSignal) s.lastSigBar = i;

    s.prevLiqLo = liqLo; s.prevLiqHi = liqHi;
    s.prevTlBearVal = tlBearVal; s.prevTlBullVal = tlBullVal;

    results.push({
      barIndex: i, bosBull, bosBear, chochBull, chochBear,
      structureBias: s.structureBias,
      inBullOb, inBearOb, bullObValid, bearObValid,
      bullObHi: s.bullObHi, bullObLo: s.bullObLo,
      bearObHi: s.bearObHi, bearObLo: s.bearObLo,
      recentBullSweep, recentBearSweep, liqSweepBull, liqSweepBear,
      msTrend: s.msTrend,
      tlBearBreak, tlBullBreak, tlBearRetest, tlBullRetest,
      sessLevelBull, sessLevelBear,
      vpBullConf, vpBearConf, nearPoc, nearVah, nearVal,
      longScore, shortScore, longSignal, shortSignal,
      pdhSweep, pdlSweep, pdh: s.pdh, pdl: s.pdl,
      poc, vah, valLine, atr14: s.atrPrev,
      fvgBullAlign, fvgBearAlign, inDiscount, inPremium,
      activeFvgs: [...s.activeFvgs],
      asiaHi: s.asiaHi, asiaLo: s.asiaLo,
      londonHi: s.londonHi, londonLo: s.londonLo,
    });
  }

  return results;
}
