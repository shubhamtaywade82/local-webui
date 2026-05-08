import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertPlaceOrderExchangeEnabled, isPlaceOrderEnvEnabled } from './placeOrderPolicy';

describe('isPlaceOrderEnvEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when PLACE_ORDER is unset', () => {
    vi.stubEnv('PLACE_ORDER', '');
    expect(isPlaceOrderEnvEnabled()).toBe(false);
  });

  it('returns true for accepted truthy tokens', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
      vi.stubEnv('PLACE_ORDER', v);
      expect(isPlaceOrderEnvEnabled()).toBe(true);
    }
  });

  it('returns false for other values', () => {
    vi.stubEnv('PLACE_ORDER', 'false');
    expect(isPlaceOrderEnvEnabled()).toBe(false);
  });

  it('assertPlaceOrderExchangeEnabled throws and does not throw when enabled', () => {
    vi.stubEnv('PLACE_ORDER', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => assertPlaceOrderExchangeEnabled('testOp', { a: 1 })).toThrow(/PLACE_ORDER/);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    vi.stubEnv('PLACE_ORDER', 'true');
    expect(() => assertPlaceOrderExchangeEnabled('testOp', {})).not.toThrow();
  });
});
