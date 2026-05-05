import { isPlaceOrderEnvEnabled, PLACE_ORDER_DISABLED_MESSAGE } from '@workspace/coindcx-client';
import type { MarketRegistry } from '@workspace/market-registry';
import type { RiskDecision } from '@workspace/risk-engine';
import type { TradeSignal } from '@workspace/signal-engine';

interface GuardResult { ok: boolean; reason?: string }

export function guardApiKeys(): GuardResult {
  const hasKeys =
    Boolean(process.env.COINDCX_API_KEY?.trim()) &&
    Boolean(process.env.COINDCX_API_SECRET?.trim());
  return hasKeys
    ? { ok: true }
    : { ok: false, reason: 'COINDCX_API_KEY and COINDCX_API_SECRET are not set' };
}

export function guardPlaceOrderEnabled(): GuardResult {
  return isPlaceOrderEnvEnabled()
    ? { ok: true }
    : { ok: false, reason: PLACE_ORDER_DISABLED_MESSAGE };
}

export function guardSignalPresent(signal: TradeSignal | null): GuardResult {
  return signal
    ? { ok: true }
    : { ok: false, reason: 'No trade signal — signal engine returned null' };
}

export function guardRiskApproved(decision: RiskDecision): GuardResult {
  return decision.allowed
    ? { ok: true }
    : { ok: false, reason: decision.reason ?? 'Risk engine rejected the trade' };
}

export function guardMetadataFresh(registry: MarketRegistry, pair: string): GuardResult {
  return registry.isStale(pair)
    ? { ok: false, reason: `Instrument metadata for ${pair} is stale — registry needs refresh` }
    : { ok: true };
}

export function guardOrderType(orderType: string): GuardResult {
  const valid = ['market_order', 'limit_order'];
  return valid.includes(orderType)
    ? { ok: true }
    : { ok: false, reason: `Unsupported order type "${orderType}". Use: ${valid.join(' | ')}` };
}
