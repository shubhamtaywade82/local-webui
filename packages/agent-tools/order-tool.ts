import { BaseTool, ToolSchema } from '@workspace/tools';
import { isCoinDcxFuturesPair, createAuthClientFromEnv } from '@workspace/coindcx-client';
import type { OrderType } from '@workspace/coindcx-client';
import type { SignalEngine } from '@workspace/signal-engine';
import type { RiskEngine, AccountState } from '@workspace/risk-engine';
import type { ExecutionEngine } from '@workspace/execution-engine';

const MOCK_ACCOUNT: AccountState = {
  availableMargin:    0,
  totalEquity:        0,
  openPositionCount:  0,
  currentDrawdownPct: 0,
  openPositions:      [],
};

export class PlaceOrderTool extends BaseTool {
  readonly name        = 'place_futures_order';
  readonly description =
    'Execute a futures order for a pair after running the full signal + risk pipeline. ' +
    'The LLM does NOT supply entry/SL/TP — all values come from the signal engine. ' +
    'Requires COINDCX_API_KEY + COINDCX_API_SECRET and PLACE_ORDER=true (server env). ' +
    'Confirm with the user before calling this tool.';

  readonly schema: ToolSchema = {
    name:        'place_futures_order',
    description: 'Place a futures order. Signal and risk checks run automatically.',
    args: {
      pair: {
        type:        'string',
        description: 'Futures pair in B-XXX_USDT format',
        required:    true,
      },
      order_type: {
        type:        'string',
        description: 'market_order or limit_order (default: market_order)',
        required:    false,
      },
    },
  };

  constructor(
    private signalEngine:    SignalEngine,
    private riskEngine:      RiskEngine,
    private executionEngine: ExecutionEngine,
  ) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const pair      = String(args.pair ?? '').trim().toUpperCase();
    const orderType = (String(args.order_type ?? 'market_order').trim()) as OrderType;

    if (!isCoinDcxFuturesPair(pair)) {
      return JSON.stringify({ error: `Invalid futures pair "${pair}". Use B-XXX_USDT format.` });
    }

    try {
      // Step 1: Fresh signal — always computed fresh, never from LLM input
      const signal = await this.signalEngine.analyze(pair);
      if (!signal) {
        return JSON.stringify({ success: false, error: 'No valid signal for this pair right now.' });
      }

      // Step 2: Live account state
      let account = MOCK_ACCOUNT;
      const client = createAuthClientFromEnv();
      if (client) {
        try {
          const positions = await client.getPositions();
          account = {
            ...MOCK_ACCOUNT,
            openPositionCount: positions.length,
            openPositions: positions.map((p) => ({
              pair:     p.pair,
              side:     p.side,
              quantity: p.quantity,
              leverage: p.leverage ?? 1,
            })),
          };
        } catch { /* use mock */ }
      }

      // Step 3: Risk decision
      const riskDecision = this.riskEngine.validate(signal, account);

      // Step 4: Execution (guards re-checked inside execute())
      const result = await this.executionEngine.execute(signal, riskDecision, orderType);

      return JSON.stringify({ signal, riskDecision, result }, null, 2);
    } catch (err) {
      return JSON.stringify({ success: false, error: (err as Error).message });
    }
  }
}
