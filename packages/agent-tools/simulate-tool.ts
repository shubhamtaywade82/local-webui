import { BaseTool, ToolSchema } from '@workspace/tools';
import { isCoinDcxFuturesPair, createAuthClientFromEnv } from '@workspace/coindcx-client';
import type { SignalEngine } from '@workspace/signal-engine';
import type { RiskEngine, AccountState } from '@workspace/risk-engine';

const MOCK_ACCOUNT: AccountState = {
  availableMargin:    0,
  totalEquity:        0,
  openPositionCount:  0,
  currentDrawdownPct: 0,
  openPositions:      [],
};

export class SimulateOrderTool extends BaseTool {
  readonly name        = 'simulate_futures_order';
  readonly description =
    'Dry-run the full signal → risk pipeline for a futures pair WITHOUT placing any order. ' +
    'Returns the TradeSignal, RiskDecision, and whether execution would be allowed. ' +
    'Safe to call freely for scenario analysis.';

  readonly schema: ToolSchema = {
    name:        'simulate_futures_order',
    description: 'Simulate signal + risk check. Never places a real order.',
    args: {
      pair: {
        type:        'string',
        description: 'Futures pair in B-XXX_USDT format',
        required:    true,
      },
    },
  };

  constructor(
    private signalEngine: SignalEngine,
    private riskEngine:   RiskEngine,
  ) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const pair = String(args.pair ?? '').trim().toUpperCase();
    if (!isCoinDcxFuturesPair(pair)) {
      return JSON.stringify({ error: `Invalid futures pair "${pair}". Use B-XXX_USDT format.` });
    }

    try {
      const signal = await this.signalEngine.generateSignal(pair);
      if (!signal) {
        return JSON.stringify({
          signal:      null,
          riskDecision: null,
          wouldExecute: false,
          reason:      'No setup detected.',
        });
      }

      // Attempt to get live account state; fall back to mock if no keys
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

      const riskDecision = this.riskEngine.validate(signal, account);
      const guards: string[] = [];
      if (!Boolean(process.env.COINDCX_API_KEY?.trim()))    guards.push('API keys not set');
      if (!riskDecision.allowed) guards.push(riskDecision.reason ?? 'Risk rejected');
      if (this.riskEngine.isMetadataFresh && !this.riskEngine.isMetadataFresh(pair))
        guards.push('Metadata stale');

      return JSON.stringify({
        signal,
        riskDecision,
        wouldExecute: guards.length === 0,
        guards,
      }, null, 2);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }
}
