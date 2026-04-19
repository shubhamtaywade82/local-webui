import { CoinDCXAuthClient, createAuthClientFromEnv } from '@workspace/coindcx-client';
import type { PositionResponse, OrderType } from '@workspace/coindcx-client';
import type { MarketRegistry } from '@workspace/market-registry';
import type { RiskDecision } from '@workspace/risk-engine';
import type { TradeSignal } from '@workspace/signal-engine';
import type { ExecutionResult, ExecutionDbAdapter } from './types';
import {
  guardApiKeys,
  guardSignalPresent,
  guardRiskApproved,
  guardMetadataFresh,
  guardOrderType,
} from './guards';

const DEFAULT_LEVERAGE = 5;

export class ExecutionEngine {
  private authClient: CoinDCXAuthClient | null;

  constructor(
    private registry: MarketRegistry,
    private db: ExecutionDbAdapter,
  ) {
    this.authClient = createAuthClientFromEnv();
  }

  // Full execution pipeline. Leverage is always set before order placement.
  async execute(
    signal: TradeSignal,
    riskDecision: RiskDecision,
    orderType: OrderType = 'market_order',
  ): Promise<ExecutionResult> {
    // 1. Guards — fail fast
    for (const result of [
      guardApiKeys(),
      guardSignalPresent(signal),
      guardRiskApproved(riskDecision),
      guardMetadataFresh(this.registry, signal.pair),
      guardOrderType(orderType),
    ]) {
      if (!result.ok) return { success: false, error: result.reason };
    }

    const client    = this.authClient!;
    const leverage  = riskDecision.adjustedLeverage ?? DEFAULT_LEVERAGE;
    const quantity  = riskDecision.adjustedQuantity ?? 0;
    const side      = signal.direction === 'long' ? 'buy' : 'sell';

    if (quantity <= 0) {
      return { success: false, error: 'Computed quantity is zero — check margin and instrument limits' };
    }

    // 2. Persist intent
    const orderRow = await this.db.saveOrder({
      pair: signal.pair, side, quantity, leverage,
      orderType, pricePerUnit: orderType === 'limit_order' ? signal.entry : undefined,
      status: 'pending',
    });

    await this.db.saveExecutionEvent('order_pending', {
      orderId: orderRow.id, pair: signal.pair, side, quantity, leverage, orderType,
    });

    try {
      // 3. Set leverage BEFORE order
      await client.updateLeverage(signal.pair, leverage);
      await this.db.saveExecutionEvent('leverage_set', { pair: signal.pair, leverage });

      // 4. Place order
      const exchangeOrder = await client.createOrder({
        pair:           signal.pair,
        side,
        order_type:     orderType,
        total_quantity: quantity,
        leverage,
        price_per_unit: orderType === 'limit_order' ? signal.entry : undefined,
        client_order_id: `ai-${Date.now()}`,
      });

      await this.db.updateOrderStatus(orderRow.id, 'open', exchangeOrder.id);
      await this.db.saveExecutionEvent('order_placed', {
        orderId: orderRow.id,
        exchangeOrderId: exchangeOrder.id,
        pair: signal.pair,
      });

      return {
        success: true,
        orderId: orderRow.id,
        exchangeOrderId: exchangeOrder.id,
        details: { pair: signal.pair, side, quantity, leverage, orderType },
      };
    } catch (err) {
      const msg = (err as Error).message;
      await this.db.updateOrderStatus(orderRow.id, 'error');
      await this.db.saveExecutionEvent('order_error', { orderId: orderRow.id, error: msg });
      return { success: false, orderId: orderRow.id, error: msg };
    }
  }

  async cancel(orderId: string): Promise<ExecutionResult> {
    const keys = guardApiKeys();
    if (!keys.ok) return { success: false, error: keys.reason };
    try {
      await this.authClient!.cancelOrder(orderId);
      await this.db.updateOrderStatus(orderId, 'cancelled');
      await this.db.saveExecutionEvent('order_cancelled', { orderId });
      return { success: true, orderId };
    } catch (err) {
      return { success: false, orderId, error: (err as Error).message };
    }
  }

  async exitPosition(pair: string, side: 'long' | 'short'): Promise<ExecutionResult> {
    const keys = guardApiKeys();
    if (!keys.ok) return { success: false, error: keys.reason };

    try {
      const positions = await this.authClient!.getPositions(pair);
      const pos = positions.find(
        (p) => p.pair === pair && p.side === (side === 'long' ? 'buy' : 'sell'),
      );
      if (!pos) return { success: false, error: `No open ${side} position for ${pair}` };

      const closeSide = side === 'long' ? 'sell' : 'buy';
      const exitOrder = await this.authClient!.createOrder({
        pair,
        side:           closeSide,
        order_type:     'market_order',
        total_quantity: pos.quantity,
        leverage:       pos.leverage ?? 1,
        client_order_id: `exit-${Date.now()}`,
      });

      await this.db.saveExecutionEvent('position_closed', { pair, side, exchangeOrderId: exitOrder.id });
      return { success: true, exchangeOrderId: exitOrder.id };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async reconcilePositions(): Promise<void> {
    const keys = guardApiKeys();
    if (!keys.ok) return;
    try {
      const positions = await this.authClient!.getPositions();
      for (const p of positions) {
        const local = await this.db.getOpenPosition(p.pair);
        if (!local) {
          await this.db.savePosition({
            pair:             p.pair,
            side:             p.side,
            quantity:         p.quantity,
            entryPrice:       p.entry_price,
            leverage:         p.leverage ?? 1,
            liquidationPrice: p.liquidation_price,
            status:           'open',
          });
        }
      }
    } catch (err) {
      console.error('[execution-engine] reconcile error:', err);
    }
  }

  async getPosition(pair: string): Promise<PositionResponse | null> {
    const keys = guardApiKeys();
    if (!keys.ok) return null;
    try {
      const positions = await this.authClient!.getPositions(pair);
      return positions[0] ?? null;
    } catch {
      return null;
    }
  }
}
