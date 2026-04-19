import { TimeframeEngine } from '@workspace/timeframe-engine';
import { runSmcEngine, DEFAULT_CONFIG } from '@workspace/tools';
import type { Candle, BarResult } from '@workspace/tools';
import type { OhlcvBar } from '@workspace/coindcx-client';
import type { TradeSignal, SmcContext, SignalDbAdapter } from './types';
import {
  determineRegime,
  checkStructure,
  checkTrigger,
  validateEntry,
  computeSlTp,
  computeConfidence,
  buildReasons,
} from './rules';

function toSmcCandles(bars: OhlcvBar[]): Candle[] {
  return bars.map((b) => ({
    open: b.open, high: b.high, low: b.low, close: b.close,
    volume: b.volume, time: b.time,
  }));
}

function toSmcContext(result: BarResult): SmcContext {
  return {
    structureBias:  result.structureBias,
    longScore:      result.longScore,
    shortScore:     result.shortScore,
    inBullOb:       result.inBullOb,
    inBearOb:       result.inBearOb,
    bullObLo:       result.bullObLo,
    bullObHi:       result.bullObHi,
    bearObLo:       result.bearObLo,
    bearObHi:       result.bearObHi,
    recentBullSweep: result.recentBullSweep,
    recentBearSweep: result.recentBearSweep,
    atr14:          result.atr14,
  };
}

export class SignalEngine {
  constructor(
    private tfEngine: TimeframeEngine,
    private db?: SignalDbAdapter,
  ) {}

  private async runAnalysis(pair: string): Promise<TradeSignal | null> {
    // Fetch all timeframes in parallel
    const [snap4h, snap1h, snap15m, snap5m, snap1m] = await Promise.all([
      this.tfEngine.getSnapshot(pair, '4h'),
      this.tfEngine.getSnapshot(pair, '1h'),
      this.tfEngine.getSnapshot(pair, '15m'),
      this.tfEngine.getSnapshot(pair, '5m'),
      this.tfEngine.getSnapshot(pair, '1m'),
    ]);

    const tf4h  = this.tfEngine.getFeatures(snap4h);
    const tf1h  = this.tfEngine.getFeatures(snap1h);
    const tf15m = this.tfEngine.getFeatures(snap15m);
    const tf5m  = this.tfEngine.getFeatures(snap5m);
    const tf1m  = this.tfEngine.getFeatures(snap1m);

    // Run SMC engine on 15m (structure) and 5m (trigger)
    const smc15mResults = runSmcEngine(toSmcCandles(snap15m.candles), DEFAULT_CONFIG);
    const smc5mResults  = runSmcEngine(toSmcCandles(snap5m.candles),  DEFAULT_CONFIG);
    if (!smc15mResults.length || !smc5mResults.length) return null;

    const smcCtx15m = toSmcContext(smc15mResults[smc15mResults.length - 1]);
    const smcCtx5m  = toSmcContext(smc5mResults[smc5mResults.length - 1]);

    // Rule layers
    const regime = determineRegime(tf4h, tf1h);
    if (!regime) return null;

    if (!checkStructure(tf15m, smcCtx15m, regime)) return null;
    if (!checkTrigger(tf5m, smcCtx5m, regime))     return null;
    if (!validateEntry(tf1m, regime))               return null;

    const entry = tf1m.close;
    const atr   = smcCtx5m.atr14 ?? tf5m.atr14;
    const { stopLoss, takeProfit } = computeSlTp(regime, entry, smcCtx15m, atr);
    const confidence = computeConfidence(
      smcCtx5m.longScore, smcCtx5m.shortScore, regime, regime,
    );
    const reasons = buildReasons(regime, regime, tf4h, tf1h, tf15m, smcCtx15m);

    return {
      pair,
      direction:   regime,
      entryType:   'market',
      entry,
      stopLoss,
      takeProfit,
      confidence,
      reasons,
      timeframes: {
        regime:     `4h ${tf4h.trendDirection} / 1h ${tf1h.trendDirection}`,
        structure:  `15m SMC bias ${smcCtx15m.structureBias}`,
        trigger:    `5m score long=${smcCtx5m.longScore} short=${smcCtx5m.shortScore}`,
        validation: `1m vwapDist=${tf1m.vwapDistance.toFixed(4)}`,
      },
      generatedAt: Date.now(),
    };
  }

  // Full analysis — persists signal to DB if one fires.
  async analyze(pair: string): Promise<TradeSignal | null> {
    const signal = await this.runAnalysis(pair);
    if (signal && this.db) {
      await this.db.saveTradeSignal({
        ...signal,
        timeframes: signal.timeframes as Record<string, unknown>,
      });
    }
    return signal;
  }

  // Same analysis without DB write — safe for simulation/LLM preview.
  async generateSignal(pair: string): Promise<TradeSignal | null> {
    return this.runAnalysis(pair);
  }
}
