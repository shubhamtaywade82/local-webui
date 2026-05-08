import { describe, it, expect, vi, afterEach } from 'vitest';
import { CoinDCXAuthClient } from './auth';

describe('CoinDCXAuthClient order mutations and PLACE_ORDER', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const client = new CoinDCXAuthClient({ apiKey: 'k', apiSecret: 's' });

  it('createOrder does not fetch when PLACE_ORDER is off', async () => {
    vi.stubEnv('PLACE_ORDER', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as Response);
    await expect(
      client.createOrder({
        pair: 'B-BTC_USDT',
        side: 'buy',
        order_type: 'market_order',
        total_quantity: 0.01,
      }),
    ).rejects.toThrow(/PLACE_ORDER/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cancelOrder does not fetch when PLACE_ORDER is off', async () => {
    vi.stubEnv('PLACE_ORDER', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(client.cancelOrder('ord-1')).rejects.toThrow(/PLACE_ORDER/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('editOrder does not fetch when PLACE_ORDER is off', async () => {
    vi.stubEnv('PLACE_ORDER', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(client.editOrder('ord-1', 100)).rejects.toThrow(/PLACE_ORDER/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
