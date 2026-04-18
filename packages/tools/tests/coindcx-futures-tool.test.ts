import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoinDCXFuturesTool } from '../coindcx-futures-tool';

const tool = new CoinDCXFuturesTool();

describe('CoinDCXFuturesTool', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('COINDCX_API_KEY', 'test-key');
    vi.stubEnv('COINDCX_API_SECRET', 'test-secret');
  });

  it('returns unknown action error', async () => {
    const result = await tool.execute({ action: 'invalid' });
    expect(result).toContain('Unknown action');
  });

  it('create_order requires pair', async () => {
    const result = await tool.execute({ action: 'create_order', side: 'buy', order_type: 'market_order', quantity: '1' });
    expect(result).toContain('pair required');
  });

  it('create_order requires side', async () => {
    const result = await tool.execute({ action: 'create_order', pair: 'B-BTC_USDT', order_type: 'market_order', quantity: '1' });
    expect(result).toContain('side required');
  });

  it('create_order requires quantity', async () => {
    const result = await tool.execute({ action: 'create_order', pair: 'B-BTC_USDT', side: 'buy', order_type: 'market_order' });
    expect(result).toContain('quantity required');
  });

  it('cancel_order requires order_id', async () => {
    const result = await tool.execute({ action: 'cancel_order' });
    expect(result).toContain('order_id required');
  });

  it('update_leverage requires pair and leverage', async () => {
    const r1 = await tool.execute({ action: 'update_leverage', leverage: '10' });
    expect(r1).toContain('pair required');
    const r2 = await tool.execute({ action: 'update_leverage', pair: 'B-BTC_USDT' });
    expect(r2).toContain('leverage required');
  });

  it('errors gracefully when API key missing', async () => {
    vi.stubEnv('COINDCX_API_KEY', '');
    const result = await tool.execute({ action: 'positions' });
    expect(result).toContain('COINDCX_API_KEY');
  });

  it('create_order posts correct shape and formats response', async () => {
    const mockOrder = {
      id: 'ord-123', pair: 'B-BTC_USDT', side: 'buy',
      order_type: 'market_order', total_quantity: 0.01,
      status: 'open', leverage: 10
    };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => mockOrder } as any);

    const result = await tool.execute({
      action: 'create_order', pair: 'B-BTC_USDT',
      side: 'buy', order_type: 'market_order', quantity: '0.01', leverage: '10'
    });
    expect(result).toContain('Order created');
    expect(result).toContain('B-BTC_USDT');
    expect(result).toContain('BUY');
  });

  it('list_orders formats multiple orders', async () => {
    const mockOrders = [
      { id: 'a', pair: 'B-BTC_USDT', side: 'buy', order_type: 'limit_order', total_quantity: 0.1, price_per_unit: 60000, status: 'open' },
      { id: 'b', pair: 'B-ETH_USDT', side: 'sell', order_type: 'market_order', total_quantity: 1, status: 'filled' },
    ];
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => mockOrders } as any);

    const result = await tool.execute({ action: 'list_orders' });
    expect(result).toContain('[a]');
    expect(result).toContain('[b]');
    expect(result).toContain('B-ETH_USDT');
  });
});
