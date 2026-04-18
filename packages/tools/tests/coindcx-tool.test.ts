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

  it('returns error when symbol missing for orderbook', async () => {
    const result = await tool.execute({ action: 'orderbook' });
    expect(result).toContain('symbol required');
  });

  it('returns error when symbol missing for trade_history', async () => {
    const result = await tool.execute({ action: 'trade_history' });
    expect(result).toContain('symbol required');
  });

  it('returns error when symbol missing for candles', async () => {
    const result = await tool.execute({ action: 'candles' });
    expect(result).toContain('symbol required');
  });

  it('spot_ticker filters by symbol and summarises', async () => {
    const mockData = [
      { market: 'BTCINR', last_price: '7500000', bid: '7499000', ask: '7501000', volume: '1234', change_24_hour: '1.5' },
      { market: 'ETHINR', last_price: '250000', bid: '249000', ask: '251000', volume: '5000', change_24_hour: '-0.5' },
    ];
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => mockData } as any);

    const result = await tool.execute({ action: 'spot_ticker', symbol: 'BTCINR' });
    expect(result).toContain('BTCINR');
    expect(result).toContain('7500000');
    expect(result).not.toContain('ETHINR');
  });

  it('spot_ticker shows no-match hint with similar suggestions', async () => {
    const mockData = [
      { market: 'GNOINR', last_price: '100', bid: '99', ask: '101', volume: '50' },
    ];
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => mockData } as any);

    const result = await tool.execute({ action: 'spot_ticker', symbol: 'BTCINR' });
    expect(result).toContain('No match');
    expect(result).toContain('markets action');
  });

  it('spot_ticker with no symbol returns top by volume', async () => {
    const mockData = Array.from({ length: 25 }, (_, i) => ({
      market: `COIN${i}INR`, last_price: '100', bid: '99', ask: '101', volume: String(i * 10)
    }));
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => mockData } as any);

    const result = await tool.execute({ action: 'spot_ticker' });
    expect(result).toContain('Top 20 by volume');
    expect(result).toContain('25 total');
  });

  it('wraps fetch errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network down'));
    const result = await tool.execute({ action: 'spot_ticker' });
    expect(result).toContain('CoinDCX error');
    expect(result).toContain('Network down');
  });

  it('futures_prices parses v3 rt envelope and matches ETHUSDT shorthand', async () => {
    const mock = {
      ts: 1,
      vs: 2,
      prices: {
        'B-ETH_USDT': { mp: 2400.5, ls: 2399.1, h: 2450, l: 2350, pc: -1.2, fr: 0.0001 },
      },
    };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => mock } as any);
    const result = await tool.execute({ action: 'futures_prices', symbol: 'ETHUSDT' });
    expect(result).toContain('B-ETH_USDT');
    expect(result).toContain('2400.5');
  });
});
