import type { PositionResponse } from '@workspace/coindcx-client';

export type { PositionResponse };

export interface ExecutionResult {
  success: boolean;
  orderId?: string;         // our internal DB id
  exchangeOrderId?: string; // exchange-assigned id
  error?: string;
  details?: Record<string, unknown>;
}

export interface ExecutionDbAdapter {
  saveOrder(order: {
    signalId?: string;
    pair: string;
    side: string;
    quantity: number;
    leverage: number;
    orderType: string;
    pricePerUnit?: number;
    status?: string;
  }): Promise<{ id: string }>;

  updateOrderStatus(
    id: string,
    status: string,
    exchangeOrderId?: string,
  ): Promise<void>;

  savePosition(position: {
    orderId?: string;
    pair: string;
    side: string;
    quantity: number;
    entryPrice: number;
    leverage: number;
    liquidationPrice?: number;
    status?: string;
  }): Promise<{ id: string }>;

  updatePosition(
    id: string,
    updates: Record<string, unknown>,
  ): Promise<void>;

  getOpenPosition(pair: string): Promise<{ id: string; side: string; quantity: number } | null>;

  saveFill(fill: {
    orderId: string;
    price: number;
    quantity: number;
    fee: number;
    timestamp: Date;
  }): Promise<unknown>;

  saveExecutionEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
}
