export interface OhlcvBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number; // epoch ms
}

export interface FuturesInstrument {
  pair: string;
  baseCurrency: string;
  quoteCurrency: string;
  contractType: string;
  status: string;
  minQuantity: number;
  maxQuantity: number;
  quantityIncrement: number;
  priceIncrement: number;
  maxLeverage: number;
  minNotional: number;
  raw: Record<string, unknown>;
}

export interface OrderBook {
  pair: string;
  bids: Record<string, string>; // price -> qty (snapshot, always full replacement)
  asks: Record<string, string>;
  timestamp: number;
}

export interface WsCandle {
  pair: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export interface WsTrade {
  pair: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market_order' | 'limit_order';

export interface CreateOrderRequest {
  pair: string;
  side: OrderSide;
  order_type: OrderType;
  total_quantity: number;
  price_per_unit?: number;
  leverage?: number;
  client_order_id?: string;
}

export interface FuturesOrderResponse {
  id: string;
  pair: string;
  side: string;
  order_type: string;
  total_quantity: number;
  price_per_unit?: number;
  status: string;
  leverage?: number;
}

export interface PositionResponse {
  pair: string;
  side: string;
  quantity: number;
  entry_price: number;
  mark_price?: number;
  unrealised_pnl?: number;
  liquidation_price?: number;
  leverage?: number;
}

export const FUTURES_CANDLESTICK_RESOLUTION: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '6h': '360',
  '8h': '480',
  '1d': '1D',
  '1D': '1D',
};

export const INTERVAL_MS: Record<string, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h':  3_600_000,
  '2h':  7_200_000,
  '4h':  14_400_000,
  '6h':  21_600_000,
  '8h':  28_800_000,
  '1d':  86_400_000,
  '1D':  86_400_000,
};

export function isCoinDcxFuturesPair(pair: string): boolean {
  return /^B-[A-Z0-9]+_USDT$/i.test(pair.trim());
}
