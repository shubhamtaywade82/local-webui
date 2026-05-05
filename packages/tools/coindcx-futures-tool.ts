import { createHmac } from 'crypto';
import { isPlaceOrderEnvEnabled, PLACE_ORDER_DISABLED_MESSAGE } from '@workspace/coindcx-client';
import { BaseTool, ToolSchema } from './types';

const BASE_URL = 'https://api.coindcx.com';

// ── Auth ──────────────────────────────────────────────────────────────────────

function sign(body: Record<string, unknown>, secret: string): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
}

async function authPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const apiKey = process.env.COINDCX_API_KEY;
  const apiSecret = process.env.COINDCX_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('COINDCX_API_KEY and COINDCX_API_SECRET env vars required for futures trading');
  }

  const payload = { ...body, timestamp: Date.now() };
  const signature = sign(payload, apiSecret);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AUTH-APIKEY': apiKey,
      'X-AUTH-SIGNATURE': signature,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoinDCX ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatOrders(data: unknown): string {
  const orders = Array.isArray(data) ? data : (data as any)?.orders ?? [data];
  if (!orders.length) return 'No orders found.';
  return orders.map((o: any) =>
    `[${o.id ?? o.order_id}] ${o.side?.toUpperCase()} ${o.pair} qty=${o.quantity ?? o.total_quantity} ` +
    `type=${o.order_type} price=${o.price_per_unit ?? o.price ?? 'market'} status=${o.status} ` +
    `leverage=${o.leverage ?? 'n/a'}`
  ).join('\n');
}

function formatPositions(data: unknown): string {
  const positions = Array.isArray(data) ? data : (data as any)?.positions ?? [data];
  if (!positions.length) return 'No open positions.';
  return positions.map((p: any) =>
    `${p.pair} ${p.side?.toUpperCase()} size=${p.quantity} entry=${p.entry_price} ` +
    `mark=${p.mark_price ?? 'n/a'} pnl=${p.unrealised_pnl ?? p.pnl ?? 'n/a'} ` +
    `liq=${p.liquidation_price ?? 'n/a'} leverage=${p.leverage ?? 'n/a'}`
  ).join('\n');
}

// ── Tool ─────────────────────────────────────────────────────────────────────

const NO_KEYS_HINT =
  'For prices, 24h change, candles, order book, and **trend / TA** use the **coindcx** tool (public; e.g. action=futures_prices or candles, symbol=B-ETH_USDT) or **smc_analysis**. ' +
  'Use **coindcx_futures** only when the user explicitly asks to place/cancel/edit **their** orders, positions, margin, or leverage — and only if COINDCX_API_KEY + COINDCX_API_SECRET are set.';

export class CoinDCXFuturesTool extends BaseTool {
  readonly name = 'coindcx_futures';
  readonly description =
    'AUTHENTICATED ONLY: place/cancel/edit **your** CoinDCX futures orders, positions, margin, leverage. ' +
    'Requires COINDCX_API_KEY + COINDCX_API_SECRET. Creating orders additionally requires PLACE_ORDER=true. **Do not use** for market price, charts, or intraday trend — use **coindcx** or **smc_analysis** instead. ' +
    'Pair format: B-BTC_USDT, B-ETH_USDT. Actions: list_orders | create_order | cancel_order | ' +
    'edit_order | positions | update_leverage | add_margin | remove_margin';

  readonly schema: ToolSchema = {
    name: 'coindcx_futures',
    description:
      'Authenticated futures trading only. Not for spot/futures **market data** (use coindcx or smc_analysis).',
    args: {
      action: {
        type: 'string',
        description:
          'One of: list_orders | create_order | cancel_order | edit_order | ' +
          'positions | update_leverage | add_margin | remove_margin',
        required: true,
      },
      pair: {
        type: 'string',
        description: 'Futures pair e.g. B-BTC_USDT, B-ETH_USDT (required for most actions)',
        required: false,
      },
      side: {
        type: 'string',
        description: 'buy or sell (required for create_order)',
        required: false,
      },
      order_type: {
        type: 'string',
        description: 'market_order or limit_order (required for create_order)',
        required: false,
      },
      quantity: {
        type: 'string',
        description: 'Order quantity as string number (required for create_order)',
        required: false,
      },
      price: {
        type: 'string',
        description: 'Limit price as string number (required for limit_order)',
        required: false,
      },
      leverage: {
        type: 'string',
        description: 'Leverage multiplier as integer string e.g. "10" (optional for create_order, required for update_leverage)',
        required: false,
      },
      order_id: {
        type: 'string',
        description: 'Order ID (required for cancel_order, edit_order)',
        required: false,
      },
      margin: {
        type: 'string',
        description: 'Margin amount as string number (required for add_margin / remove_margin)',
        required: false,
      },
      client_order_id: {
        type: 'string',
        description: 'Optional idempotency key for create_order',
        required: false,
      },
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '').trim();
    const pair = args.pair ? String(args.pair) : undefined;

    if (!action || action === 'undefined' || action === 'null') {
      return (
        'Invalid coindcx_futures call: missing or empty `action`. ' +
        'For market questions use **coindcx** (e.g. action=futures_prices, symbol=B-ETH_USDT) or **smc_analysis**. ' +
        'Valid futures actions: list_orders | create_order | cancel_order | edit_order | positions | update_leverage | add_margin | remove_margin.'
      );
    }

    const apiKey = process.env.COINDCX_API_KEY?.trim();
    const apiSecret = process.env.COINDCX_API_SECRET?.trim();
    if (!apiKey || !apiSecret) {
      return (
        'CoinDCX API keys are not configured (set COINDCX_API_KEY and COINDCX_API_SECRET for authenticated trading). ' +
        NO_KEYS_HINT
      );
    }

    try {
      switch (action) {

        case 'list_orders': {
          const body: Record<string, unknown> = {};
          if (pair) body.pair = pair;
          const data = await authPost('/exchange/v1/derivatives/futures/orders', body);
          return formatOrders(data);
        }

        case 'create_order': {
          if (!isPlaceOrderEnvEnabled()) {
            return PLACE_ORDER_DISABLED_MESSAGE;
          }
          if (!pair) return 'Error: pair required (e.g. B-BTC_USDT)';
          if (!args.side) return 'Error: side required (buy or sell)';
          if (!args.order_type) return 'Error: order_type required (market_order or limit_order)';
          if (!args.quantity) return 'Error: quantity required';

          const order: Record<string, unknown> = {
            pair,
            side: String(args.side),
            order_type: String(args.order_type),
            total_quantity: parseFloat(String(args.quantity)),
            client_order_id: args.client_order_id
              ? String(args.client_order_id)
              : `ai-${Date.now()}`,
          };
          if (args.price) order.price_per_unit = parseFloat(String(args.price));
          if (args.leverage) order.leverage = parseInt(String(args.leverage), 10);

          const data = await authPost('/exchange/v1/derivatives/futures/orders/create', { order });
          return `Order created:\n${formatOrders(data)}`;
        }

        case 'cancel_order': {
          if (!args.order_id) return 'Error: order_id required';
          const data = await authPost('/exchange/v1/derivatives/futures/orders/cancel', {
            id: String(args.order_id),
          });
          return `Order cancelled:\n${JSON.stringify(data, null, 2)}`;
        }

        case 'edit_order': {
          if (!args.order_id) return 'Error: order_id required';
          if (!args.price) return 'Error: price required for edit_order';
          const data = await authPost('/exchange/v1/derivatives/futures/orders/edit', {
            id: String(args.order_id),
            price_per_unit: parseFloat(String(args.price)),
          });
          return `Order updated:\n${JSON.stringify(data, null, 2)}`;
        }

        case 'positions': {
          const body: Record<string, unknown> = {};
          if (pair) body.pair = pair;
          const data = await authPost('/exchange/v1/derivatives/futures/positions', body);
          return formatPositions(data);
        }

        case 'update_leverage': {
          if (!pair) return 'Error: pair required';
          if (!args.leverage) return 'Error: leverage required';
          const data = await authPost(
            '/exchange/v1/derivatives/futures/positions/update_leverage',
            { pair, leverage: parseInt(String(args.leverage), 10) }
          );
          return `Leverage updated:\n${JSON.stringify(data, null, 2)}`;
        }

        case 'add_margin': {
          if (!pair) return 'Error: pair required';
          if (!args.margin) return 'Error: margin amount required';
          const data = await authPost(
            '/exchange/v1/derivatives/futures/positions/add_margin',
            { pair, margin: parseFloat(String(args.margin)) }
          );
          return `Margin added:\n${JSON.stringify(data, null, 2)}`;
        }

        case 'remove_margin': {
          if (!pair) return 'Error: pair required';
          if (!args.margin) return 'Error: margin amount required';
          const data = await authPost(
            '/exchange/v1/derivatives/futures/positions/remove_margin',
            { pair, margin: parseFloat(String(args.margin)) }
          );
          return `Margin removed:\n${JSON.stringify(data, null, 2)}`;
        }

        default:
          return `Unknown action "${action}". Valid: list_orders | create_order | cancel_order | edit_order | positions | update_leverage | add_margin | remove_margin`;
      }
    } catch (err) {
      return `CoinDCX futures error: ${(err as Error).message}`;
    }
  }
}
