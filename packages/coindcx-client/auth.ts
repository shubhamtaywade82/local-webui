import { createHmac } from 'crypto';
import type {
  CreateOrderRequest,
  FuturesOrderResponse,
  PositionResponse,
} from './types';

const API_BASE = 'https://api.coindcx.com';

export interface AuthConfig {
  apiKey: string;
  apiSecret: string;
}

export class CoinDCXAuthClient {
  constructor(private config: AuthConfig) {}

  private sign(body: Record<string, unknown>): string {
    return createHmac('sha256', this.config.apiSecret)
      .update(JSON.stringify(body))
      .digest('hex');
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const payload = { ...body, timestamp: Date.now() };
    const signature = this.sign(payload);
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-APIKEY': this.config.apiKey,
        'X-AUTH-SIGNATURE': signature,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CoinDCX ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async listOrders(pair?: string): Promise<FuturesOrderResponse[]> {
    const body: Record<string, unknown> = {};
    if (pair) body.pair = pair;
    const data = await this.post<unknown>('/exchange/v1/derivatives/futures/orders', body);
    const arr = Array.isArray(data) ? data : (data as any)?.orders ?? [data];
    return arr as FuturesOrderResponse[];
  }

  async createOrder(req: CreateOrderRequest): Promise<FuturesOrderResponse> {
    const data = await this.post<unknown>(
      '/exchange/v1/derivatives/futures/orders/create',
      { order: req },
    );
    const arr = Array.isArray(data) ? data : (data as any)?.orders ?? [data];
    return arr[0] as FuturesOrderResponse;
  }

  async cancelOrder(orderId: string): Promise<unknown> {
    return this.post('/exchange/v1/derivatives/futures/orders/cancel', { id: orderId });
  }

  async editOrder(orderId: string, pricePerUnit: number): Promise<unknown> {
    return this.post('/exchange/v1/derivatives/futures/orders/edit', {
      id: orderId,
      price_per_unit: pricePerUnit,
    });
  }

  async getPositions(pair?: string): Promise<PositionResponse[]> {
    const body: Record<string, unknown> = {};
    if (pair) body.pair = pair;
    const data = await this.post<unknown>('/exchange/v1/derivatives/futures/positions', body);
    const arr = Array.isArray(data) ? data : (data as any)?.positions ?? [data];
    return arr as PositionResponse[];
  }

  async updateLeverage(pair: string, leverage: number): Promise<unknown> {
    return this.post('/exchange/v1/derivatives/futures/positions/update_leverage', {
      pair,
      leverage,
    });
  }

  async addMargin(pair: string, margin: number): Promise<unknown> {
    return this.post('/exchange/v1/derivatives/futures/positions/add_margin', { pair, margin });
  }

  async removeMargin(pair: string, margin: number): Promise<unknown> {
    return this.post('/exchange/v1/derivatives/futures/positions/remove_margin', { pair, margin });
  }
}

export function createAuthClientFromEnv(): CoinDCXAuthClient | null {
  const apiKey    = process.env.COINDCX_API_KEY?.trim();
  const apiSecret = process.env.COINDCX_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return new CoinDCXAuthClient({ apiKey, apiSecret });
}
