import { MarketRegistry } from '@workspace/market-registry';
import type { TradeSignal } from '@workspace/signal-engine';
import type { AccountState, RiskConfig, RiskDecision } from './types';
import { DEFAULT_RISK_CONFIG } from './types';
import {
  validateInstrumentLimits,
  validatePortfolioLimits,
  validateCorrelation,
  validateDrawdown,
} from './validators';

const DEFAULT_LEVERAGE = 5;

export class RiskEngine {
  constructor(
    private registry: MarketRegistry,
    private config: RiskConfig = DEFAULT_RISK_CONFIG,
  ) {}

  validate(signal: TradeSignal, account: AccountState): RiskDecision {
    // Drawdown gate
    const dd = validateDrawdown(account, this.config);
    if (!dd.ok) return { allowed: false, reason: dd.reason };

    // Portfolio limits
    const port = validatePortfolioLimits(signal, account, this.config);
    if (!port.ok) return { allowed: false, reason: port.reason };

    // Correlation
    const corr = validateCorrelation(signal, account, this.config);
    if (!corr.ok) return { allowed: false, reason: corr.reason };

    // Instrument limits
    const meta = this.registry.getInstrument(signal.pair);
    if (!meta) {
      return { allowed: false, reason: `No metadata for ${signal.pair} — registry may be empty` };
    }

    const leverage = Math.min(DEFAULT_LEVERAGE, this.config.maxLeverage);
    const estimatedQty = account.availableMargin > 0
      ? (account.availableMargin * 0.1 * leverage) / signal.entry
      : meta.minQuantity;

    const inst = validateInstrumentLimits(estimatedQty, signal.entry, meta, leverage);
    if (!inst.ok) return { allowed: false, reason: inst.reason };

    return {
      allowed:          true,
      adjustedQuantity: inst.adjustedQuantity,
      adjustedLeverage: inst.adjustedLeverage ?? leverage,
    };
  }

  isMetadataFresh(pair: string): boolean {
    return !this.registry.isStale(pair);
  }
}
