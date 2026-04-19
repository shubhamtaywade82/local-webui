import { BaseTool, ToolSchema } from '@workspace/tools';
import { isCoinDcxFuturesPair } from '@workspace/coindcx-client';
import type { SignalEngine } from '@workspace/signal-engine';

export class AnalysisSetupTool extends BaseTool {
  readonly name        = 'analyze_futures_setup';
  readonly description =
    'Runs the full multi-timeframe signal engine on a futures pair. ' +
    'Returns a TradeSignal with entry, stop-loss, take-profit, confidence, and reasons — ' +
    'or null if no setup is detected. All values are deterministically computed, not guessed.';

  readonly schema: ToolSchema = {
    name:        'analyze_futures_setup',
    description: 'Run deterministic signal analysis for a futures pair. Returns TradeSignal or null.',
    args: {
      pair: {
        type:        'string',
        description: 'Futures pair in B-XXX_USDT format, e.g. B-ETH_USDT',
        required:    true,
      },
    },
  };

  constructor(private signalEngine: SignalEngine) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const pair = String(args.pair ?? '').trim().toUpperCase();
    if (!isCoinDcxFuturesPair(pair)) {
      return JSON.stringify({ error: `Invalid futures pair "${pair}". Use B-XXX_USDT format.` });
    }
    try {
      const signal = await this.signalEngine.generateSignal(pair);
      if (!signal) {
        return JSON.stringify({ signal: null, reason: 'No high-confidence setup detected at this time.' });
      }
      return JSON.stringify({ signal }, null, 2);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }
}
