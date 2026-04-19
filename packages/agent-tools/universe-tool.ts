import { BaseTool, ToolSchema } from '@workspace/tools';
import type { MarketRegistry } from '@workspace/market-registry';

export class UniverseTool extends BaseTool {
  readonly name        = 'get_active_futures_universe';
  readonly description =
    'Returns all active USDT-margined futures pairs with instrument metadata (leverage, min size, etc.). ' +
    'Use this to discover tradable symbols before analysis.';

  readonly schema: ToolSchema = {
    name:        'get_active_futures_universe',
    description: 'List all active CoinDCX USDT futures instruments with key metadata.',
    args: {},
  };

  constructor(private registry: MarketRegistry) { super(); }

  async execute(_args: Record<string, unknown>): Promise<string> {
    const instruments = this.registry.getAllActive();
    if (!instruments.length) {
      return JSON.stringify({ error: 'Registry is empty — run market registry refresh first.' });
    }
    const summary = instruments.map((m) => ({
      pair:         m.pair,
      baseCurrency: m.baseCurrency,
      maxLeverage:  m.maxLeverage,
      minQuantity:  m.minQuantity,
      maxQuantity:  m.maxQuantity,
      status:       m.status,
    }));
    return JSON.stringify({ count: summary.length, instruments: summary }, null, 2);
  }
}
