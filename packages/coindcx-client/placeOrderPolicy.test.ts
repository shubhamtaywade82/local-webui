import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPlaceOrderEnvEnabled } from './placeOrderPolicy';

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
});
