import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoinDCXTool } from '../coindcx-tool';

const tool = new CoinDCXTool();

describe('CoinDCXTool', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns unknown action error for bad action', async () => {
    const result = await tool.execute({ action: 'invalid' });
    expect(result).toContain('Unknown action');
  });

  it('returns error when pair missing for orderbook', async () => {
    const result = await tool.execute({ action: 'orderbook' });
    expect(result).toContain('pair required');
  });

  it('returns error when pair missing for trade_history', async () => {
    const result = await tool.execute({ action: 'trade_history' });
    expect(result).toContain('pair required');
  });

  it('returns error when pair missing for candles', async () => {
    const result = await tool.execute({ action: 'candles' });
    expect(result).toContain('pair required');
  });

  it('calls ticker endpoint and summarises', async () => {
    const mockData = Array.from({ length: 25 }, (_, i) => ({
      market: `COIN${i}INR`, last_price: '100', bid: '99', ask: '101', volume: '500', change_24_hour: '2.5'
    }));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as any);

    const result = await tool.execute({ action: 'ticker' });
    expect(result).toContain('Top 20 tickers');
    expect(result).toContain('of 25');
  });

  it('wraps fetch errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network down'));
    const result = await tool.execute({ action: 'ticker' });
    expect(result).toContain('CoinDCX error');
    expect(result).toContain('Network down');
  });
});
