import { BaseTool, ToolSchema } from '@workspace/tools';
import { isCoinDcxFuturesPair } from '@workspace/coindcx-client';
import type { TimeframeEngine } from '@workspace/timeframe-engine';

export class MultiTfContextTool extends BaseTool {
  readonly name        = 'get_multi_timeframe_context';
  readonly description =
    'Returns pre-computed technical features for a futures pair across 4h, 1h, 15m, and 5m timeframes. ' +
    'Features include trend direction, EMA21/50, ATR, RSI, VWAP distance, volume expansion. ' +
    'Raw candle arrays are never returned — use this instead of raw chart data.';

  readonly schema: ToolSchema = {
    name:        'get_multi_timeframe_context',
    description: 'Get pre-computed multi-timeframe features. No raw OHLCV returned.',
    args: {
      pair: {
        type:        'string',
        description: 'Futures pair in B-XXX_USDT format',
        required:    true,
      },
    },
  };

  constructor(private tfEngine: TimeframeEngine) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const pair = String(args.pair ?? '').trim().toUpperCase();
    if (!isCoinDcxFuturesPair(pair)) {
      return JSON.stringify({ error: `Invalid futures pair "${pair}". Use B-XXX_USDT format.` });
    }
    try {
      const ctx = await this.tfEngine.getMultiTfContext(pair);
      // Explicitly omit candles from output — LLM gets only pre-computed features
      return JSON.stringify(ctx, null, 2);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }
}
