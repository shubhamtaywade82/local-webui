import { BaseTool, ToolSchema } from './types';
import { runSmcEngine, Candle, BarResult, DEFAULT_CONFIG, SmcConfig } from './smc-engine';

const PUBLIC_BASE = 'https://public.coindcx.com';
const API_BASE = 'https://api.coindcx.com';

// ── Candle fetcher ─────────────────────────────────────────────────────────────

async function fetchCandles(pair: string, interval: string, limit: number): Promise<Candle[]> {
  const now = Date.now();
  // Estimate startTime from interval
  const intervalMs: Record<string, number> = {
    '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
    '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '6h': 21_600_000,
    '1d': 86_400_000,
  };
  const ms = intervalMs[interval] ?? 3_600_000;
  const startTime = now - ms * (limit + 10);

  const url = `${PUBLIC_BASE}/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}&startTime=${startTime}&endTime=${now}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`CoinDCX candles ${res.status}: ${await res.text()}`);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  // Sort ascending by time (API returns descending)
  return [...raw]
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object' && 'time' in c)
    .sort((a, b) => Number(a.time) - Number(b.time))
    .map(c => ({
      open: parseFloat(String(c.open)), high: parseFloat(String(c.high)),
      low: parseFloat(String(c.low)), close: parseFloat(String(c.close)),
      volume: parseFloat(String(c.volume ?? 0)), time: Number(c.time),
    }))
    .filter(c => Number.isFinite(c.close) && Number.isFinite(c.time));
}

/**
 * Resolve to CoinDCX futures pair `B-BASE_USDT`.
 * Accepts ETH, BTCUSDT, B-ETH_USDT, perp:ETH — must not double-strip `B-ETH_USDT` into `B-ETH__USDT`.
 */
export function toCoinDcxFuturesPair(sym: string): string {
  let t = sym.trim().toUpperCase();
  if (/^B-[A-Z0-9]+_USDT$/.test(t)) return t;
  t = t.replace(/^PERP:?/i, '').replace(/^F:?/i, '');
  t = t.replace(/-?USDT$/i, '');
  t = t.replace(/^B-/, '');
  t = t.replace(/_/g, '');
  if (!t || !/^[A-Z0-9]+$/.test(t)) {
    throw new Error(`Invalid futures symbol "${sym}" — use e.g. ETH, BTC, or B-ETH_USDT`);
  }
  return `B-${t}_USDT`;
}

function noCandlesMsg(pair: string, interval: string): string {
  return (
    `No OHLCV candles from CoinDCX for pair=${pair} interval=${interval}. ` +
    `If you passed a full pair, it must look like B-ETH_USDT (not ETH/USDT). Try a higher limit or another interval.`
  );
}

// ── Formatters ─────────────────────────────────────────────────────────────────

const biasLabel = (b: number) => b === 1 ? 'BULLISH' : b === -1 ? 'BEARISH' : 'NEUTRAL';

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return 'n/a';
  return v > 1000 ? v.toFixed(2) : v > 1 ? v.toFixed(4) : v.toFixed(6);
}

function formatSmcSummary(tf: string, last: BarResult, candles: Candle[]): string {
  const lastBar = candles[candles.length - 1];
  const close = lastBar?.close ?? null;
  const lines: string[] = [`=== ${tf} SMC Analysis ===`];
  lines.push(`Price: ${fmtPrice(close ?? undefined)} | ATR14: ${fmtPrice(last.atr14)}`);
  lines.push(`Structure bias: ${biasLabel(last.structureBias)} | MS trend: ${biasLabel(last.msTrend)}`);
  lines.push(`Long score: ${last.longScore}/8 | Short score: ${last.shortScore}/8`);

  if (last.longSignal) lines.push(`⚡ LONG SIGNAL fired this bar`);
  if (last.shortSignal) lines.push(`⚡ SHORT SIGNAL fired this bar`);

  // BOS / CHoCH
  const strEvents: string[] = [];
  if (last.bosBull) strEvents.push('BOS-BULL');
  if (last.bosBear) strEvents.push('BOS-BEAR');
  if (last.chochBull) strEvents.push('CHoCH-BULL');
  if (last.chochBear) strEvents.push('CHoCH-BEAR');
  if (strEvents.length) lines.push(`Structure events: ${strEvents.join(', ')}`);

  // Order blocks
  if (last.bullObValid) lines.push(`Bull OB: ${fmtPrice(last.bullObLo)} – ${fmtPrice(last.bullObHi)}${last.inBullOb ? ' ← PRICE INSIDE' : ''}`);
  if (last.bearObValid) lines.push(`Bear OB: ${fmtPrice(last.bearObLo)} – ${fmtPrice(last.bearObHi)}${last.inBearOb ? ' ← PRICE INSIDE' : ''}`);

  // Liquidity
  const liqEvents: string[] = [];
  if (last.liqSweepBull) liqEvents.push('bull-sweep (low swept+closed above)');
  if (last.liqSweepBear) liqEvents.push('bear-sweep (high swept+closed below)');
  if (last.recentBullSweep) liqEvents.push('recent-bull-sweep');
  if (last.recentBearSweep) liqEvents.push('recent-bear-sweep');
  if (liqEvents.length) lines.push(`Liquidity: ${liqEvents.join(', ')}`);

  // FVGs
  if (last.activeFvgs.length > 0) {
    const fvgStr = last.activeFvgs.slice(-3).map(f =>
      `${f.side} FVG ${fmtPrice(f.gapLow)}–${fmtPrice(f.gapHigh)}`
    ).join(', ');
    lines.push(`FVGs active: ${fvgStr}`);
  }
  if (last.fvgBullAlign) lines.push(`  → Price in bullish FVG zone`);
  if (last.fvgBearAlign) lines.push(`  → Price in bearish FVG zone`);

  // Volume profile
  if (last.poc !== null) {
    lines.push(`Vol profile: POC=${fmtPrice(last.poc)} VAH=${fmtPrice(last.vah)} VAL=${fmtPrice(last.valLine)}`);
    if (last.nearPoc) lines.push(`  → Near POC (high confluence zone)`);
    if (last.nearVah) lines.push(`  → Near VAH (selling pressure zone)`);
    if (last.nearVal) lines.push(`  → Near VAL (buying support zone)`);
  }

  // Trendlines
  const tlEvents: string[] = [];
  if (last.tlBearBreak) tlEvents.push('bear-TL broken (bullish)');
  if (last.tlBullBreak) tlEvents.push('bull-TL broken (bearish)');
  if (last.tlBearRetest) tlEvents.push('bear-TL retest (long entry zone)');
  if (last.tlBullRetest) tlEvents.push('bull-TL retest (short entry zone)');
  if (tlEvents.length) lines.push(`Trendlines: ${tlEvents.join(', ')}`);

  // Session levels
  if (last.pdh !== null) lines.push(`PDH: ${fmtPrice(last.pdh)}${last.pdhSweep ? ' ← SWEPT' : ''} | PDL: ${fmtPrice(last.pdl)}${last.pdlSweep ? ' ← SWEPT' : ''}`);
  if (last.asiaHi !== null) lines.push(`Asia range: ${fmtPrice(last.asiaLo)} – ${fmtPrice(last.asiaHi)}`);
  if (last.londonHi !== null) lines.push(`London range: ${fmtPrice(last.londonLo)} – ${fmtPrice(last.londonHi)}`);

  // Premium / discount
  if (last.inDiscount) lines.push(`Zone: DISCOUNT (price below mid-range → long bias)`);
  if (last.inPremium) lines.push(`Zone: PREMIUM (price above mid-range → short bias)`);

  return lines.join('\n');
}

function buildTradeSetup(htfLast: BarResult, ltfLast: BarResult, pair: string, htfTf: string, ltfTf: string): string {
  const htfBias = htfLast.structureBias;
  const ltfBias = ltfLast.structureBias;
  const lines: string[] = [`\n=== MTF TRADE SETUP (${pair}) ===`];
  lines.push(`HTF (${htfTf}): ${biasLabel(htfBias)} | LTF (${ltfTf}): ${biasLabel(ltfBias)}`);

  const longOk = htfBias >= 0 && ltfLast.structureBias === 1;
  const shortOk = htfBias <= 0 && ltfLast.structureBias === -1;

  if (!longOk && !shortOk) {
    lines.push(`No aligned setup — HTF and LTF bias conflict. Wait for confluence.`);
    return lines.join('\n');
  }

  if (longOk && ltfLast.longScore >= 3) {
    lines.push(`DIRECTION: LONG ✓`);
    lines.push(`Entry zone: ${ltfLast.bullObValid ? `Bull OB ${fmtPrice(ltfLast.bullObLo)}–${fmtPrice(ltfLast.bullObHi)}` : 'near current price on pullback'}`);
    lines.push(`Invalidation: close below ${ltfLast.pdl != null ? fmtPrice(ltfLast.pdl) : 'recent swing low'}`);
    if (ltfLast.atr14) lines.push(`Stop suggestion: ${fmtPrice(ltfLast.atr14 * 1.5)} below entry (~1.5× ATR)`);
    const reasons: string[] = [];
    if (ltfLast.inBullOb) reasons.push('price in bull OB');
    if (ltfLast.recentBullSweep) reasons.push('recent liquidity sweep');
    if (ltfLast.vpBullConf) reasons.push('vol profile support');
    if (ltfLast.sessLevelBull) reasons.push('session level support');
    if (ltfLast.tlBearRetest) reasons.push('bear TL retest');
    if (ltfLast.fvgBullAlign) reasons.push('bullish FVG');
    if (ltfLast.inDiscount) reasons.push('discount zone');
    if (reasons.length) lines.push(`Confluence: ${reasons.join(', ')}`);
  }

  if (shortOk && ltfLast.shortScore >= 3) {
    lines.push(`DIRECTION: SHORT ✓`);
    lines.push(`Entry zone: ${ltfLast.bearObValid ? `Bear OB ${fmtPrice(ltfLast.bearObLo)}–${fmtPrice(ltfLast.bearObHi)}` : 'near current price on rally'}`);
    lines.push(`Invalidation: close above ${ltfLast.pdh != null ? fmtPrice(ltfLast.pdh) : 'recent swing high'}`);
    if (ltfLast.atr14) lines.push(`Stop suggestion: ${fmtPrice(ltfLast.atr14 * 1.5)} above entry (~1.5× ATR)`);
    const reasons: string[] = [];
    if (ltfLast.inBearOb) reasons.push('price in bear OB');
    if (ltfLast.recentBearSweep) reasons.push('recent liquidity sweep');
    if (ltfLast.vpBearConf) reasons.push('vol profile resistance');
    if (ltfLast.sessLevelBear) reasons.push('session level resistance');
    if (ltfLast.tlBullRetest) reasons.push('bull TL retest');
    if (ltfLast.fvgBearAlign) reasons.push('bearish FVG');
    if (ltfLast.inPremium) reasons.push('premium zone');
    if (reasons.length) lines.push(`Confluence: ${reasons.join(', ')}`);
  }

  return lines.join('\n');
}

function findRecentSignals(results: BarResult[], candles: Candle[], lookback = 10): string {
  const recent = results.slice(-lookback);
  const signals: string[] = [];
  for (const r of recent) {
    const bar = candles[r.barIndex];
    const ts = bar ? new Date(bar.time).toISOString() : '?';
    if (r.longSignal) signals.push(`[${ts}] LONG signal (score ${r.longScore})`);
    if (r.shortSignal) signals.push(`[${ts}] SHORT signal (score ${r.shortScore})`);
  }
  return signals.length ? signals.join('\n') : 'No signals in last 10 bars';
}

// ── Tool ───────────────────────────────────────────────────────────────────────

export class SmcAnalysisTool extends BaseTool {
  readonly name = 'smc_analysis';
  readonly description =
    'Smart Money Concepts (SMC) multi-timeframe analysis on CoinDCX futures. ' +
    'Computes order blocks, BOS/CHoCH, liquidity sweeps, FVGs, volume profile, session levels, ' +
    'confluence scoring, and MTF trade setup. Symbol: BTC, ETH, SOL or full pair B-ETH_USDT (CoinDCX futures). ' +
    'Actions: full_analysis | structure | order_blocks | liquidity | fvg | setup | signals';

  readonly schema: ToolSchema = {
    name: 'smc_analysis',
    description: 'SMC multi-timeframe analysis — order blocks, BOS/CHoCH, FVGs, liquidity, confluence scoring',
    args: {
      action: {
        type: 'string',
        description: 'full_analysis | structure | order_blocks | liquidity | fvg | setup | signals',
        required: true,
      },
      symbol: {
        type: 'string',
        description: 'BTC, ETH, SOL, etc., or full futures pair e.g. B-ETH_USDT (CoinDCX)',
        required: true,
      },
      htf: {
        type: 'string',
        description: 'Higher timeframe for structure bias: 1h (default), 4h, 1d',
        required: false,
      },
      ltf: {
        type: 'string',
        description: 'Lower timeframe for entry signals: 15m (default), 5m, 30m',
        required: false,
      },
      limit: {
        type: 'string',
        description: 'Candles to fetch per timeframe (default 150, max 500)',
        required: false,
      },
      fvg: {
        type: 'string',
        description: 'Include FVG confluence: true/false (default false)',
        required: false,
      },
      bos_relaxed: {
        type: 'string',
        description: 'Count BOS as primary trigger (relaxed mode): true/false (default false)',
        required: false,
      },
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '');
    const symbol = args.symbol ? String(args.symbol) : '';
    if (!symbol) return 'Error: symbol required (e.g. BTC, ETH, SOL)';

    const pair = toCoinDcxFuturesPair(symbol);
    const htfTf = String(args.htf ?? '1h');
    const ltfTf = String(args.ltf ?? '15m');
    const limit = Math.min(500, parseInt(String(args.limit ?? '150'), 10) || 150);
    const fvgConfluence = String(args.fvg ?? 'false') === 'true';
    const bosRelaxed = String(args.bos_relaxed ?? 'false') === 'true';

    const cfg: Partial<SmcConfig> = { fvgConfluence, bosRelaxed, pdLookback: 50 };

    try {
      switch (action) {

        case 'full_analysis': {
          const [htfCandles, ltfCandles] = await Promise.all([
            fetchCandles(pair, htfTf, limit),
            fetchCandles(pair, ltfTf, limit),
          ]);
          if (!htfCandles.length || !ltfCandles.length) return noCandlesMsg(pair, `${htfTf}/${ltfTf}`);

          const htfResults = runSmcEngine(htfCandles, cfg);
          const ltfResults = runSmcEngine(ltfCandles, cfg);
          const htfLast = htfResults.at(-1);
          const ltfLast = ltfResults.at(-1);
          if (!htfLast || !ltfLast) return `SMC produced no results for ${pair}`;

          return [
            formatSmcSummary(htfTf.toUpperCase(), htfLast, htfCandles),
            '',
            formatSmcSummary(ltfTf.toUpperCase(), ltfLast, ltfCandles),
            buildTradeSetup(htfLast, ltfLast, pair, htfTf, ltfTf),
            '',
            `Recent ${ltfTf} signals:\n${findRecentSignals(ltfResults, ltfCandles)}`,
          ].join('\n');
        }

        case 'setup': {
          const [htfCandles, ltfCandles] = await Promise.all([
            fetchCandles(pair, htfTf, limit),
            fetchCandles(pair, ltfTf, limit),
          ]);
          if (!htfCandles.length || !ltfCandles.length) {
            return noCandlesMsg(pair, !htfCandles.length ? htfTf : ltfTf);
          }
          const htfLast = runSmcEngine(htfCandles, cfg).at(-1);
          const ltfLast = runSmcEngine(ltfCandles, cfg).at(-1);
          if (!htfLast || !ltfLast) return `SMC produced no results for ${pair}`;
          return buildTradeSetup(htfLast, ltfLast, pair, htfTf, ltfTf);
        }

        case 'structure': {
          const candles = await fetchCandles(pair, htfTf, limit);
          if (!candles.length) return noCandlesMsg(pair, htfTf);
          const last = runSmcEngine(candles, cfg).at(-1);
          if (!last) return `SMC produced no bars for ${pair} [${htfTf}]`;
          return formatSmcSummary(htfTf.toUpperCase(), last, candles).split('\n').filter(l =>
            l.includes('===') || l.includes('Structure') || l.includes('BOS') || l.includes('CHoCH') || l.includes('Price')
          ).join('\n');
        }

        case 'order_blocks': {
          const candles = await fetchCandles(pair, ltfTf, limit);
          if (!candles.length) return noCandlesMsg(pair, ltfTf);
          const last = runSmcEngine(candles, cfg).at(-1);
          if (!last) return `SMC produced no bars for ${pair} [${ltfTf}]`;
          const lines = [`Order Blocks for ${pair} [${ltfTf}]:`];
          if (last.bullObValid) lines.push(`Bull OB: ${fmtPrice(last.bullObLo)} – ${fmtPrice(last.bullObHi)}${last.inBullOb ? ' ← PRICE INSIDE (active support)' : ''}`);
          else lines.push('Bull OB: none valid');
          if (last.bearObValid) lines.push(`Bear OB: ${fmtPrice(last.bearObLo)} – ${fmtPrice(last.bearObHi)}${last.inBearOb ? ' ← PRICE INSIDE (active resistance)' : ''}`);
          else lines.push('Bear OB: none valid');
          return lines.join('\n');
        }

        case 'liquidity': {
          const candles = await fetchCandles(pair, ltfTf, limit);
          if (!candles.length) return noCandlesMsg(pair, ltfTf);
          const last = runSmcEngine(candles, cfg).at(-1);
          if (!last) return `SMC produced no bars for ${pair} [${ltfTf}]`;
          const lines = [`Liquidity levels for ${pair} [${ltfTf}]:`];
          if (last.pdh) lines.push(`PDH: ${fmtPrice(last.pdh)}${last.pdhSweep ? ' ← SWEPT today' : ''}`);
          if (last.pdl) lines.push(`PDL: ${fmtPrice(last.pdl)}${last.pdlSweep ? ' ← SWEPT today' : ''}`);
          if (last.asiaHi) lines.push(`Asia H: ${fmtPrice(last.asiaHi)} L: ${fmtPrice(last.asiaLo)}`);
          if (last.londonHi) lines.push(`London H: ${fmtPrice(last.londonHi)} L: ${fmtPrice(last.londonLo)}`);
          if (last.recentBullSweep) lines.push(`Recent BULL sweep — lows taken, watch for reversal up`);
          if (last.recentBearSweep) lines.push(`Recent BEAR sweep — highs taken, watch for reversal down`);
          return lines.join('\n');
        }

        case 'fvg': {
          const candles = await fetchCandles(pair, ltfTf, limit);
          if (!candles.length) return noCandlesMsg(pair, ltfTf);
          const results = runSmcEngine(candles, { ...cfg, fvgConfluence: true });
          const last = results.at(-1);
          if (!last) return `SMC produced no bars for ${pair} [${ltfTf}]`;
          if (!last.activeFvgs.length) return `No active FVGs for ${pair} [${ltfTf}]`;
          const lines = [`Active FVGs for ${pair} [${ltfTf}]:`];
          for (const f of last.activeFvgs) {
            lines.push(`${f.side.toUpperCase()} FVG: ${fmtPrice(f.gapLow)} – ${fmtPrice(f.gapHigh)}`);
          }
          if (last.fvgBullAlign) lines.push('→ Price currently in bullish FVG');
          if (last.fvgBearAlign) lines.push('→ Price currently in bearish FVG');
          return lines.join('\n');
        }

        case 'signals': {
          const candles = await fetchCandles(pair, ltfTf, limit);
          if (!candles.length) return noCandlesMsg(pair, ltfTf);
          const results = runSmcEngine(candles, cfg);
          return `Recent SMC signals for ${pair} [${ltfTf}]:\n${findRecentSignals(results, candles, 20)}`;
        }

        default:
          return `Unknown action "${action}". Valid: full_analysis | structure | order_blocks | liquidity | fvg | setup | signals`;
      }
    } catch (err) {
      return `SMC analysis error: ${(err as Error).message}`;
    }
  }
}
