/**
 * Kill-switch for any CoinDCX futures **order** REST mutation: create, cancel, edit.
 * Default: off unless PLACE_ORDER is explicitly enabled. When off, callers must not
 * hit the exchange — use `assertPlaceOrderExchangeEnabled` before authenticated order POSTs.
 */
export function isPlaceOrderEnvEnabled(): boolean {
  const v = process.env.PLACE_ORDER;
  if (v == null || v === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase().trim());
}

export const PLACE_ORDER_DISABLED_MESSAGE =
  'CoinDCX order actions are disabled. Set PLACE_ORDER=true in the server environment to send create, cancel, or edit order requests to the exchange.';

/**
 * When PLACE_ORDER is off: log the would-be request and throw (no network).
 */
export function assertPlaceOrderExchangeEnabled(operation: string, details: Record<string, unknown>): void {
  if (isPlaceOrderEnvEnabled()) return;
  console.warn(
    `[coindcx] PLACE_ORDER disabled — exchange order call skipped (dry run): ${operation}`,
    JSON.stringify(details),
  );
  throw new Error(PLACE_ORDER_DISABLED_MESSAGE);
}
