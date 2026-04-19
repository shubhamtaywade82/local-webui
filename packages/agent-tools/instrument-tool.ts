import { BaseTool, ToolSchema } from '@workspace/tools';
import { isCoinDcxFuturesPair } from '@workspace/coindcx-client';
import type { MarketRegistry } from '@workspace/market-registry';

export class InstrumentTool extends BaseTool {
  readonly name        = 'get_futures_instrument';
  readonly description =
    'Returns contract metadata for a specific futures pair: min/max quantity, price increment, ' +
    'leverage caps, min notional. Required before sizing any order.';

  readonly schema: ToolSchema = {
    name:        'get_futures_instrument',
    description: 'Get CoinDCX futures contract metadata for a specific pair.',
    args: {
      pair: {
        type:        'string',
        description: 'Futures pair in B-XXX_USDT format, e.g. B-BTC_USDT',
        required:    true,
      },
    },
  };

  constructor(private registry: MarketRegistry) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    const pair = String(args.pair ?? '').trim().toUpperCase();
    if (!isCoinDcxFuturesPair(pair)) {
      return JSON.stringify({ error: `Invalid futures pair "${pair}". Use B-XXX_USDT format.` });
    }
    const meta = this.registry.getInstrument(pair);
    if (!meta) {
      return JSON.stringify({ error: `No metadata for ${pair}. It may not be active.` });
    }
    return JSON.stringify(meta, null, 2);
  }
}
