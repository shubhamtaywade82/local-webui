/**
 * Kill-switch for creating new futures orders (REST `create` / execution engine).
 * Default: off unless PLACE_ORDER is explicitly enabled.
 */
export function isPlaceOrderEnvEnabled(): boolean {
  const v = process.env.PLACE_ORDER;
  if (v == null || v === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase().trim());
}

export const PLACE_ORDER_DISABLED_MESSAGE =
  'Order placement is disabled. Set PLACE_ORDER=true in the server environment to allow creating futures orders.';
