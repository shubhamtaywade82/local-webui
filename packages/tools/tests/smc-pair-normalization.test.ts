import { describe, it, expect } from 'vitest';
import { toCoinDcxFuturesPair } from '../smc-analysis-tool';

describe('toCoinDcxFuturesPair', () => {
  it('preserves a valid CoinDCX futures pair (no double underscore)', () => {
    expect(toCoinDcxFuturesPair('B-ETH_USDT')).toBe('B-ETH_USDT');
    expect(toCoinDcxFuturesPair('b-eth_usdt')).toBe('B-ETH_USDT');
  });

  it('maps base symbols to B-BASE_USDT', () => {
    expect(toCoinDcxFuturesPair('ETH')).toBe('B-ETH_USDT');
    expect(toCoinDcxFuturesPair('BTC')).toBe('B-BTC_USDT');
    expect(toCoinDcxFuturesPair('BTCUSDT')).toBe('B-BTC_USDT');
  });

  it('rejects invalid symbols', () => {
    expect(() => toCoinDcxFuturesPair('')).toThrow(/Invalid futures symbol/);
    expect(() => toCoinDcxFuturesPair('!!!')).toThrow(/Invalid futures symbol/);
  });
});
