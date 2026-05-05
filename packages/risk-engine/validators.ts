import type { InstrumentMeta } from '@workspace/market-registry';
import type { TradeSignal } from '@workspace/signal-engine';
import type { AccountState, RiskConfig } from './types';

interface ValidationResult {
  ok: boolean;
  reason?: string;
  adjustedQuantity?: number;
  adjustedLeverage?: number;
}

export function validateInstrumentLimits(
  quantity: number,
  price: number,
  meta: InstrumentMeta,
  leverage: number,
): ValidationResult {
  // Leverage cap
  const adjLev = Math.min(leverage, meta.maxLeverage);

  // Clamp quantity to instrument bounds
  let adjQty = quantity;
  if (meta.quantityIncrement > 0) {
    adjQty = Math.floor(quantity / meta.quantityIncrement) * meta.quantityIncrement;
  }
  if (adjQty < meta.minQuantity) {
    return { ok: false, reason: `Quantity ${adjQty} below min ${meta.minQuantity} for ${meta.pair}` };
  }
  if (meta.maxQuantity > 0 && adjQty > meta.maxQuantity) {
    adjQty = meta.maxQuantity;
  }

  // Notional check
  const notional = adjQty * price;
  if (meta.minNotional > 0 && notional < meta.minNotional) {
    return {
      ok: false,
      reason: `Notional ${notional.toFixed(2)} below min ${meta.minNotional} for ${meta.pair}`,
    };
  }

  return {
    ok: true,
    adjustedQuantity: adjQty !== quantity ? adjQty : undefined,
    adjustedLeverage: adjLev !== leverage ? adjLev : undefined,
  };
}

export function validatePortfolioLimits(
  signal: TradeSignal,
  account: AccountState,
  config: RiskConfig,
): ValidationResult {
  if (account.openPositionCount >= config.maxOpenPositions) {
    return {
      ok: false,
      reason: `Open positions (${account.openPositionCount}) at limit (${config.maxOpenPositions})`,
    };
  }

  // Max loss per trade: SL distance as % of equity
  const slDistance   = Math.abs(signal.entry - signal.stopLoss);
  const slPct        = signal.entry > 0 ? (slDistance / signal.entry) * 100 : 0;
  const maxSlPct     = config.maxLossPerTradePct;
  if (slPct > maxSlPct * 3) {
    // Stop is unreasonably wide — block
    return {
      ok: false,
      reason: `Stop loss distance ${slPct.toFixed(1)}% exceeds max ${maxSlPct * 3}%`,
    };
  }

  return { ok: true };
}

export function validateCorrelation(
  signal: TradeSignal,
  account: AccountState,
  config: RiskConfig,
): ValidationResult {
  const sameDir = account.openPositions.filter(
    (p) => p.side === (signal.direction === 'long' ? 'buy' : 'sell'),
  ).length;

  if (sameDir >= config.maxCorrelationExposure) {
    return {
      ok: false,
      reason: `${sameDir} open ${signal.direction} positions at correlation limit (${config.maxCorrelationExposure})`,
    };
  }

  return { ok: true };
}

export function validateDrawdown(
  account: AccountState,
  config: RiskConfig,
): ValidationResult {
  if (account.currentDrawdownPct >= config.maxDrawdownPct) {
    return {
      ok: false,
      reason: `Portfolio drawdown ${account.currentDrawdownPct.toFixed(1)}% at limit ${config.maxDrawdownPct}%`,
    };
  }
  return { ok: true };
}
