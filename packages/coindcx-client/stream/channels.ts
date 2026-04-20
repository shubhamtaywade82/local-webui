import type { StreamMarketKind } from './types';

/** Futures LTP stream: `{pair}@prices-futures` */
export function futuresLtpChannel(pair: string): string {
  return `${pair}@prices-futures`;
}

/** Bulk futures mark / last prices (RT). */
export function futuresCurrentPricesRtChannel(): string {
  return 'currentPrices@futures@rt';
}

/** Spot bulk current prices (RT). */
export function spotCurrentPricesRtChannel(): string {
  return 'currentPrices@spot@rt';
}

export function candleChannel(
  pair: string,
  interval: string,
  market: StreamMarketKind,
): string {
  return market === 'futures' ? `${pair}_${interval}-futures` : `${pair}_${interval}`;
}

export function orderbookChannel(
  pair: string,
  depth: 10 | 20 | 50,
  market: StreamMarketKind,
): string {
  return market === 'futures'
    ? `${pair}@orderbook@${depth}-futures`
    : `${pair}@orderbook@${depth}`;
}

export function tradesChannel(pair: string, market: StreamMarketKind): string {
  return market === 'futures' ? `${pair}@trades-futures` : `${pair}@trades`;
}

export function ltpChannel(pair: string, market: StreamMarketKind): string {
  return market === 'futures' ? `${pair}@prices-futures` : `${pair}@prices`;
}

export function currentPricesRtChannel(market: StreamMarketKind): string {
  return market === 'futures' ? futuresCurrentPricesRtChannel() : spotCurrentPricesRtChannel();
}
