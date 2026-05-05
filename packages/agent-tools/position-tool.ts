import { BaseTool, ToolSchema } from '@workspace/tools';
import { isCoinDcxFuturesPair } from '@workspace/coindcx-client';
import type { ExecutionEngine } from '@workspace/execution-engine';

export class PositionStateTool extends BaseTool {
  readonly name        = 'get_position_state';
  readonly description =
    'Returns current open position(s) for a futures pair from the exchange. ' +
    'Includes side, size, entry price, unrealised PnL, liquidation price, and leverage. ' +
    'Pass pair=ALL to list all open positions.';

  readonly schema: ToolSchema = {
    name:        'get_position_state',
    description: 'Get current futures position state for a pair or all open positions.',
    args: {
      pair: {
        type:        'string',
        description: 'Futures pair in B-XXX_USDT format, or "ALL" for all open positions',
        required:    true,
      },
    },
  };

  constructor(private executionEngine: ExecutionEngine) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const pair = String(args.pair ?? '').trim().toUpperCase();

    if (pair === 'ALL') {
      const pos = await this.executionEngine.getPosition('');
      return JSON.stringify({ positions: pos ? [pos] : [] }, null, 2);
    }

    if (!isCoinDcxFuturesPair(pair)) {
      return JSON.stringify({ error: `Invalid futures pair "${pair}". Use B-XXX_USDT format or "ALL".` });
    }

    try {
      const pos = await this.executionEngine.getPosition(pair);
      return JSON.stringify({ position: pos ?? null }, null, 2);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }
}
