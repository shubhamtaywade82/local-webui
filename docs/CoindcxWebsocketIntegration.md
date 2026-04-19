Coindcx websocket integration for both spot and futures

Are these two following different approaches

```
We’ll design a modular, event‑driven WebSocket client for CoinDCX that is pluggable and can be dropped into any Node.js or browser‑side project. The package will abstract connection management, channel subscription, authentication, and event mapping, exposing a simple event emitter interface.

---

Package Structure

```
coindcx-socket/
├── src/
│   ├── core/
│   │   ├── ConnectionManager.ts    # Socket.IO lifecycle & reconnection
│   │   ├── ChannelManager.ts       # Join/leave channels, track subscriptions
│   │   └── EventBus.ts             # Internal event emitter
│   ├── auth/
│   │   └── AuthProvider.ts         # HMAC signature generation
│   ├── events/
│   │   ├── PublicEvents.ts         # Event names and payload types
│   │   └── PrivateEvents.ts
│   ├── types/
│   │   └── index.ts                # Shared TypeScript interfaces
│   ├── CoinDCXSocket.ts            # Main public API
│   └── index.ts                    # Entry point
├── package.json
├── tsconfig.json
└── README.md
```

---

Core Components

1. EventBus

A simple event emitter that extends EventEmitter (Node) or a custom implementation for browser compatibility. All incoming WebSocket messages are forwarded to this bus.

```typescript
// src/core/EventBus.ts
import EventEmitter from 'events';
export const eventBus = new EventEmitter();
```

2. ConnectionManager

Manages the Socket.IO connection, reconnection logic, and heartbeats.

```typescript
// src/core/ConnectionManager.ts
import io, { Socket } from 'socket.io-client';
import { eventBus } from './EventBus';

export class ConnectionManager {
  private socket: Socket | null = null;
  private readonly endpoint = 'wss://stream.coindcx.com';

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.endpoint, { transports: ['websocket'] });
      this.socket.on('connect', () => {
        eventBus.emit('connected');
        resolve();
      });
      this.socket.on('disconnect', (reason) => {
        eventBus.emit('disconnected', reason);
      });
      this.socket.on('connect_error', (err) => reject(err));
    });
  }

  getSocket(): Socket {
    if (!this.socket) throw new Error('Socket not connected');
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
  }
}
```

3. ChannelManager

Handles joining/leaving channels and forwards incoming events to the EventBus.

```typescript
// src/core/ChannelManager.ts
import { Socket } from 'socket.io-client';
import { eventBus } from './EventBus';

export class ChannelManager {
  constructor(private socket: Socket) {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Map all known events to the eventBus
    const events = [
      'balance-update', 'order-update', 'trade-update',
      'candlestick', 'depth-snapshot', 'depth-update',
      'currentPrices@spot#update', 'priceStats@spot#update',
      'new-trade', 'price-change'
    ];
    events.forEach(event => {
      this.socket.on(event, (data) => {
        eventBus.emit(event, data);
      });
    });
  }

  join(channelName: string, auth?: { signature: string; apiKey: string }): void {
    const payload: any = { channelName };
    if (auth) {
      payload.authSignature = auth.signature;
      payload.apiKey = auth.apiKey;
    }
    this.socket.emit('join', payload);
  }

  leave(channelName: string): void {
    this.socket.emit('leave', { channelName });
  }
}
```

4. AuthProvider

Generates HMAC‑SHA256 signatures required for private channels.

```typescript
// src/auth/AuthProvider.ts
import crypto from 'crypto';

export class AuthProvider {
  constructor(private apiKey: string, private secret: string) {}

  getAuth(channel = 'coindcx'): { signature: string; apiKey: string } {
    const body = { channel };
    const payload = Buffer.from(JSON.stringify(body)).toString();
    const signature = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    return { signature, apiKey: this.apiKey };
  }
}
```

5. Main CoinDCXSocket Class

The public API that ties everything together.

```typescript
// src/CoinDCXSocket.ts
import { ConnectionManager } from './core/ConnectionManager';
import { ChannelManager } from './core/ChannelManager';
import { AuthProvider } from './auth/AuthProvider';
import { eventBus } from './core/EventBus';
import { EventEmitter } from 'events';

export class CoinDCXSocket extends EventEmitter {
  private connection: ConnectionManager;
  private channelManager: ChannelManager | null = null;
  private authProvider: AuthProvider | null = null;

  constructor(private options?: { apiKey?: string; secret?: string }) {
    super();
    this.connection = new ConnectionManager();
    if (options?.apiKey && options?.secret) {
      this.authProvider = new AuthProvider(options.apiKey, options.secret);
    }
    // Forward all events from the internal bus to this instance
    this.forwardEvents();
  }

  private forwardEvents(): void {
    // List of all possible events (could be imported)
    const allEvents = [/* ... */];
    allEvents.forEach(ev => {
      eventBus.on(ev, (data) => this.emit(ev, data));
    });
    eventBus.on('connected', () => this.emit('connected'));
    eventBus.on('disconnected', (reason) => this.emit('disconnected', reason));
  }

  async connect(): Promise<void> {
    await this.connection.connect();
    this.channelManager = new ChannelManager(this.connection.getSocket());
  }

  // Public methods

  joinPublicChannel(channel: string): void {
    if (!this.channelManager) throw new Error('Not connected');
    this.channelManager.join(channel);
  }

  joinPrivateChannel(): void {
    if (!this.authProvider) throw new Error('API credentials required');
    if (!this.channelManager) throw new Error('Not connected');
    const auth = this.authProvider.getAuth();
    this.channelManager.join('coindcx', auth);
  }

  leaveChannel(channel: string): void {
    this.channelManager?.leave(channel);
  }

  disconnect(): void {
    this.connection.disconnect();
  }
}
```

---

Pluggable & Event‑Driven Usage

Installation (hypothetical)

```bash
npm install coindcx-socket socket.io-client
```

Example 1: Public Channel – BTC/USDT Candlesticks

```typescript
import { CoinDCXSocket } from 'coindcx-socket';

const client = new CoinDCXSocket();

client.on('connected', () => {
  console.log('Connected');
  client.joinPublicChannel('B-BTC_USDT_1m');
});

client.on('candlestick', (data) => {
  console.log('Candle update:', data);
});

client.connect().catch(console.error);
```

Example 2: Private Channel – Balance & Order Updates

```typescript
const client = new CoinDCXSocket({
  apiKey: 'YOUR_API_KEY',
  secret: 'YOUR_SECRET'
});

client.on('balance-update', (data) => {
  console.log('Balance changed:', data);
});

client.on('order-update', (data) => {
  console.log('Order status:', data);
});

client.on('connected', () => client.joinPrivateChannel());

client.connect();
```

Example 3: Multiple Event Listeners with Typed Payloads

With TypeScript you can provide strong typing:

```typescript
import { CoinDCXSocket, BalanceUpdateEvent, OrderUpdateEvent } from 'coindcx-socket';

const client = new CoinDCXSocket({ apiKey: '...', secret: '...' });

client.on<BalanceUpdateEvent>('balance-update', (balances) => {
  balances.forEach(b => console.log(`${b.currency_short_name}: ${b.balance}`));
});

client.on<OrderUpdateEvent>('order-update', (order) => {
  console.log(`Order ${order.id} is ${order.status}`);
});
```

---

Making It Pluggable

1. Custom Event Handlers – Users can attach listeners via .on() as shown.
2. Middleware / Hooks – Add lifecycle hooks (e.g., beforeJoin, afterMessage) by exposing a plugin system.
3. Reconnection Strategy – Allow users to override default reconnection settings via options in the constructor.
4. Logging Adapter – Accept a logger interface (e.g., Winston, Pino) for debug output.
5. Transport Flexibility – Although Socket.IO is used, the core can be abstracted to support raw WebSockets if needed.

Example Plugin Interface

```typescript
interface Plugin {
  onConnect?: () => void;
  onMessage?: (event: string, data: any) => void;
  onError?: (err: Error) => void;
}

class CoinDCXSocket {
  use(plugin: Plugin): void { /* ... */ }
}
```

---

Next Steps

· Full TypeScript Definitions – Export interfaces for every event payload.
· Channel Validation – Validate channel names against known patterns (e.g., B-{pair}_{interval}).
· Auto‑Rejoin – Re‑subscribe to channels after reconnection.
· Browser Support – Replace Node.js crypto with Web Crypto API or a polyfill.
· Testing – Unit tests with mocked Socket.IO.

This design gives you a clean, event‑driven package that can be dropped into any application with minimal configuration. Would you like me to elaborate on any specific part or provide a working prototype repository?
```
```
We'll design a modular WebSocket engine for CoinDCX Futures that is pluggable, event-driven, and handles all subscription types. The implementation uses socket.io-client v2, Node.js EventEmitter, and includes robust reconnection logic.

Package Overview

The engine provides:

· Connection lifecycle – connect, disconnect, reconnect with exponential backoff
· Authentication – signs join payload for private channels
· Channel management – subscribe/unsubscribe to any stream
· Liveness monitoring – ping/pong and automatic recovery
· Event-driven interface – emits typed events for each data stream
· Re‑subscription – restores active channels after reconnection

Core Implementation

```typescript
// CoinDCXFuturesWebSocket.ts
import io, { Socket } from 'socket.io-client';
import { createHmac } from 'crypto';
import { EventEmitter } from 'events';
import TypedEmitter from 'typed-emitter'; // optional for strong typing

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------
export interface CoinDCXConfig {
  apiKey?: string;
  secret?: string;
  endpoint?: string;               // defaults to wss://stream.coindcx.com
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  pingInterval?: number;           // ms, default 10000
}

export interface PositionUpdate {
  id: string;
  pair: string;
  active_pos: number;
  inactive_pos_buy: number;
  inactive_pos_sell: number;
  avg_price: number;
  liquidation_price: number;
  locked_margin: number;
  locked_user_margin: number;
  locked_order_margin: number;
  take_profit_trigger: number | null;
  stop_loss_trigger: number | null;
  leverage: number;
  mark_price: number;
  maintenance_margin: number;
  updated_at: number;
  margin_type: 'isolated' | 'cross';
  margin_currency_short_name: string;
  settlement_currency_avg_price: number;
}

export interface OrderUpdate {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  status: string;
  order_type: string;
  stop_trigger_instruction: string | null;
  notification: string | null;
  leverage: number;
  maker_fee: number;
  taker_fee: number;
  fee_amount: number;
  price: number;
  stop_price: number;
  avg_price: number;
  total_quantity: number;
  remaining_quantity: number;
  cancelled_quantity: number;
  ideal_margin: number;
  order_category: string;
  stage: string;
  created_at: number;
  updated_at: number;
  take_profit_price: number | null;
  stop_loss_price: number | null;
  trades: any[];
  display_message: string | null;
  group_status: string | null;
  group_id: string | null;
  metatags: any;
  margin_currency_short_name: string;
  settlement_currency_conversion_price: number;
}

export interface BalanceUpdate {
  id: string;
  balance: string;
  locked_balance: string;
  currency_id: string;
  currency_short_name: string;
}

export interface CandlestickData {
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  open_time: number;
  close_time: number;
  pair: string;
  duration: string;
  symbol: string;
  quote_volume: string;
}

export interface DepthSnapshot {
  ts: number;
  vs: number;
  asks: Record<string, string>;
  bids: Record<string, string>;
  pr: 'futures';
}

export interface CurrentPriceUpdate {
  vs: number;
  ts: number;
  pr: 'futures';
  pST: number;
  prices: Record<string, {
    mp?: number;          // mark price
    bmST?: number;        // mark price send time
    cmRT?: number;        // range timestamp
  }>;
}

export interface NewTrade {
  T: number;          // timestamp
  RT: number;         // range timestamp
  p: string;          // price
  q: string;          // quantity
  m: number;          // maker (1) or taker (0)
  s: string;          // symbol e.g., "B-ID_USDT"
  pr: 'f';
}

export interface PriceChange {
  T: number;
  p: string;
  pr: 'f';
}

// ------------------------------------------------------------------
// Main WebSocket Engine Class
// ------------------------------------------------------------------
export class CoinDCXFuturesWebSocket extends (EventEmitter as new () => TypedEmitter<CoinDCXEvents>) {
  private socket: Socket | null = null;
  private config: Required<CoinDCXConfig>;
  private subscribedChannels: Set<string> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private connected = false;
  private authenticated = false;

  constructor(config: CoinDCXConfig = {}) {
    super();
    this.config = {
      apiKey: config.apiKey || '',
      secret: config.secret || '',
      endpoint: config.endpoint || 'wss://stream.coindcx.com',
      autoReconnect: config.autoReconnect ?? true,
      reconnectAttempts: config.reconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 3000,
      pingInterval: config.pingInterval ?? 10000,
    };
  }

  // ------------------------------------------------------------------
  // Public Connection Methods
  // ------------------------------------------------------------------
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        return resolve();
      }

      this.socket = io(this.config.endpoint, {
        transports: ['websocket'],
        reconnection: false, // we handle reconnection manually
      });

      this.socket.on('connect', () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.emit('connected');

        // Authenticate if credentials provided
        if (this.config.apiKey && this.config.secret) {
          this.authenticate();
        }

        // Restore previous subscriptions
        this.resubscribeAll();

        this.startPingMonitor();
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        this.authenticated = false;
        this.stopPingMonitor();
        this.emit('disconnected', reason);
        if (this.config.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      this.socket.on('connect_error', (error) => {
        this.emit('error', error);
        reject(error);
      });

      // Register all event listeners
      this.registerEventListeners();
    });
  }

  public disconnect(): void {
    this.cleanupTimers();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.subscribedChannels.clear();
    this.emit('disconnected', 'manual');
  }

  public get isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  public get isAuthenticated(): boolean {
    return this.authenticated;
  }

  // ------------------------------------------------------------------
  // Channel Subscription / Unsubscription
  // ------------------------------------------------------------------
  public subscribe(channelName: string): void {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    // For private channel "coindcx", require authentication
    if (channelName === 'coindcx' && !this.authenticated) {
      throw new Error('Must authenticate before subscribing to private channel');
    }

    this.socket!.emit('join', { channelName });
    this.subscribedChannels.add(channelName);
    this.emit('subscribed', channelName);
  }

  public unsubscribe(channelName: string): void {
    if (!this.isConnected) return;

    this.socket!.emit('leave', { channelName });
    this.subscribedChannels.delete(channelName);
    this.emit('unsubscribed', channelName);
  }

  // Convenience methods for specific streams
  public subscribePositions(): void {
    this.subscribe('coindcx');
  }

  public subscribeOrders(): void {
    this.subscribe('coindcx');
  }

  public subscribeBalances(): void {
    this.subscribe('coindcx');
  }

  public subscribeCandles(instrument: string, interval: string): void {
    // interval: 1m,5m,15m,30m,1h,4h,8h,1d,3d,1w,1M
    const channel = `${instrument}_${interval}-futures`;
    this.subscribe(channel);
  }

  public subscribeOrderBook(instrument: string, depth: 10 | 20 | 50 = 20): void {
    const channel = `${instrument}@orderbook@${depth}-futures`;
    this.subscribe(channel);
  }

  public subscribeCurrentPrices(): void {
    this.subscribe('currentPrices@futures@rt');
  }

  public subscribeTrades(instrument: string): void {
    const channel = `${instrument}@trades-futures`;
    this.subscribe(channel);
  }

  public subscribeLTP(instrument: string): void {
    const channel = `${instrument}@prices-futures`;
    this.subscribe(channel);
  }

  // ------------------------------------------------------------------
  // Private Helpers
  // ------------------------------------------------------------------
  private authenticate(): void {
    if (!this.socket || !this.config.apiKey || !this.config.secret) return;

    const body = { channel: 'coindcx' };
    const payload = Buffer.from(JSON.stringify(body)).toString();
    const signature = createHmac('sha256', this.config.secret)
      .update(payload)
      .digest('hex');

    this.socket.emit('join', {
      channelName: 'coindcx',
      authSignature: signature,
      apiKey: this.config.apiKey,
    });

    this.authenticated = true;
    this.subscribedChannels.add('coindcx');
    this.emit('authenticated');
  }

  private registerEventListeners(): void {
    if (!this.socket) return;

    // Private streams (only when authenticated)
    this.socket.on('df-position-update', (response: any) => {
      this.emit('position', response.data);
    });

    this.socket.on('df-order-update', (response: any) => {
      this.emit('order', response.data);
    });

    this.socket.on('balance-update', (response: any) => {
      this.emit('balance', response.data);
    });

    // Public streams
    this.socket.on('candlestick', (response: any) => {
      this.emit('candle', {
        data: response.data,
        eventTimestamp: response.Ets,
        interval: response.i,
        channel: response.channel,
        product: response.pr,
      });
    });

    this.socket.on('depth-snapshot', (response: any) => {
      this.emit('depth', response);
    });

    this.socket.on('currentPrices@futures#update', (response: any) => {
      this.emit('prices', response);
    });

    this.socket.on('new-trade', (response: any) => {
      // This event is used for both trades and LTP; we differentiate by channel
      // In the documentation, both new-trade and price-change use the same event name
      // We'll check the structure to emit appropriate events
      if (response.pr === 'f' && response.q) {
        this.emit('trade', response as NewTrade);
      } else if (response.pr === 'f' && !response.q) {
        this.emit('ltp', response as PriceChange);
      }
    });

    // Handle generic errors
    this.socket.on('error', (err: any) => {
      this.emit('error', err);
    });
  }

  private resubscribeAll(): void {
    for (const channel of this.subscribedChannels) {
      // Skip 'coindcx' as it requires authentication which will be done separately
      if (channel === 'coindcx') continue;
      this.socket!.emit('join', { channelName: channel });
    }
    if (this.subscribedChannels.has('coindcx') && this.config.apiKey) {
      this.authenticate();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempt >= this.config.reconnectAttempts) {
      this.emit('reconnect_failed');
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      this.emit('reconnecting', this.reconnectAttempt);
      this.connect().catch(() => {
        // Will trigger another schedule on disconnect
      });
    }, delay);
  }

  private startPingMonitor(): void {
    this.pingTimer = setInterval(() => {
      if (this.socket?.connected) {
        // Socket.io has built-in ping, but we can also emit custom ping
        this.socket.emit('ping');
      } else {
        // Connection lost; let disconnect handler handle it
      }
    }, this.config.pingInterval);
  }

  private stopPingMonitor(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanupTimers(): void {
    this.stopPingMonitor();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ------------------------------------------------------------------
// Event Typings (for TypeScript users)
// ------------------------------------------------------------------
export type CoinDCXEvents = {
  connected: () => void;
  disconnected: (reason: string) => void;
  authenticated: () => void;
  error: (error: any) => void;
  reconnecting: (attempt: number) => void;
  reconnect_failed: () => void;
  subscribed: (channel: string) => void;
  unsubscribed: (channel: string) => void;
  position: (data: PositionUpdate[]) => void;
  order: (data: OrderUpdate[]) => void;
  balance: (data: BalanceUpdate[]) => void;
  candle: (data: {
    data: CandlestickData[];
    eventTimestamp: number;
    interval: string;
    channel: string;
    product: string;
  }) => void;
  depth: (data: DepthSnapshot) => void;
  prices: (data: CurrentPriceUpdate) => void;
  trade: (data: NewTrade) => void;
  ltp: (data: PriceChange) => void;
};
```

Usage Example

```typescript
import { CoinDCXFuturesWebSocket } from './CoinDCXFuturesWebSocket';

// Instantiate with your credentials
const ws = new CoinDCXFuturesWebSocket({
  apiKey: 'your-api-key',
  secret: 'your-secret',
  autoReconnect: true,
  reconnectAttempts: 10,
});

// Listen to events
ws.on('connected', () => console.log('Connected'));
ws.on('authenticated', () => console.log('Authenticated'));
ws.on('position', (positions) => {
  console.log('Positions updated:', positions);
});
ws.on('order', (orders) => {
  console.log('Orders updated:', orders);
});
ws.on('balance', (balances) => {
  console.log('Balances:', balances);
});
ws.on('candle', ({ data }) => {
  console.log('Candle:', data[0]);
});
ws.on('depth', (snapshot) => {
  console.log('Orderbook snapshot:', snapshot);
});
ws.on('trade', (trade) => {
  console.log('New trade:', trade);
});
ws.on('ltp', (price) => {
  console.log('LTP:', price);
});
ws.on('error', (err) => console.error('WebSocket error:', err));
ws.on('disconnected', (reason) => console.log('Disconnected:', reason));
ws.on('reconnecting', (attempt) => console.log(`Reconnecting attempt ${attempt}`));

// Connect and subscribe
await ws.connect();

// Subscribe to private streams (all use the same 'coindcx' channel)
ws.subscribePositions();
ws.subscribeOrders();
ws.subscribeBalances();

// Subscribe to public streams
ws.subscribeCandles('B-BTC_USDT', '1m');
ws.subscribeOrderBook('B-ETH_USDT', 20);
ws.subscribeCurrentPrices();
ws.subscribeTrades('B-BTC_USDT');
ws.subscribeLTP('B-BTC_USDT');

// Later, unsubscribe
ws.unsubscribe('B-BTC_USDT_1m-futures');

// Disconnect cleanly
ws.disconnect();
```

Integration into an Event-Driven System

The engine is built on EventEmitter, making it straightforward to integrate with message buses, RxJS subjects, or custom event handlers. For example, with RxJS:

```typescript
import { fromEvent } from 'rxjs';

const position$ = fromEvent(ws, 'position');
position$.subscribe((positions) => {
  // React to position updates
});
```

Notes

· Socket.io Client Version: Ensure you install socket.io-client@^2.x (the documentation explicitly mentions V2).
· Private Channel Authentication: The coindcx channel requires a signed join payload. The engine handles this automatically when apiKey and secret are provided.
· Reconnection Logic: Exponential backoff is implemented. Subscriptions are restored automatically after reconnection.
· Liveness: The built-in Socket.io ping is used; a custom ping interval can be set for additional monitoring.
· Error Handling: All errors are emitted via the error event; the caller can decide on retry strategies.

This package is ready to be dropped into any Node.js/TypeScript project and extended as needed.
```

**Direct answer:**
Yes — these are **two different architectural approaches**, not just implementations for spot vs futures.

---

# 1. Core Difference (Not superficial)

| Dimension         | First Design (Generic Socket SDK) | Second Design (Futures Engine)               |
| ----------------- | --------------------------------- | -------------------------------------------- |
| Abstraction Level | **Framework / SDK layer**         | **Concrete trading engine**                  |
| Scope             | Spot + Futures (loosely)          | Futures-specific (deeply integrated)         |
| Design Style      | Modular + pluggable               | Stateful + lifecycle-managed                 |
| Responsibility    | Transport + event forwarding      | Full trading stream orchestration            |
| Opinionation      | Low                               | High                                         |
| State Management  | Minimal                           | Heavy (subscriptions, auth, reconnect, ping) |

---

# 2. What the First Approach Actually Is

This is a **thin SDK wrapper over CoinDCX WebSocket**.

### Characteristics

* Event bus abstraction
* Channel join/leave
* No strong domain modeling
* No lifecycle guarantees
* No state recovery
* No trading semantics

### Reality

This is **just a transport adapter**, not production trading infra.

### Critical Gaps

* ❌ No resubscription logic
* ❌ No channel state tracking
* ❌ No liveness guarantees
* ❌ No futures-specific parsing
* ❌ No backpressure handling
* ❌ No sequencing / ordering guarantees

👉 This will break in real trading conditions.

---

# 3. What the Second Approach Is

This is a **stateful, production-grade WebSocket engine**.

### Characteristics

* Connection lifecycle control
* Subscription registry
* Authentication lifecycle
* Reconnection with exponential backoff
* Ping/liveness monitoring
* Event normalization (trade vs LTP split)
* Futures-specific schema handling

### This is closer to:

* Binance production clients
* Institutional trading infra
* Your DhanHQ WebSocket system

---

# 4. Spot vs Futures — Reality Check

**CoinDCX does NOT have fundamentally different WebSocket protocols for spot vs futures.**

They differ in:

* Channel naming
* Payload structure
* Event types
* Some private streams

### Meaning:

You do **NOT** need two architectures.

You need:

> **One engine + pluggable market adapters**

---

# 5. Correct Architecture (What You Should Build)

Your current direction is slightly fragmented.

## Replace both with this:

### Unified Engine + Market Modules

```
CoinDCXWebSocketEngine
├── core/
│   ├── ConnectionManager
│   ├── SubscriptionRegistry
│   ├── ReconnectManager
│   ├── AuthManager
│   └── EventRouter
│
├── markets/
│   ├── spot/
│   │   ├── SpotChannelBuilder
│   │   ├── SpotEventParser
│   │
│   ├── futures/
│       ├── FuturesChannelBuilder
│       ├── FuturesEventParser
│
├── streams/
│   ├── OrderStream
│   ├── TradeStream
│   ├── DepthStream
│   ├── CandleStream
│   ├── PriceStream
│
└── CoinDCXClient (public API)
```

---

# 6. Design Decision (Final)

### ❌ Do NOT use approach 1

Too naive for trading systems.

### ❌ Do NOT use approach 2 as-is

Too tightly coupled to futures → not reusable.

### ✅ Build this instead:

> **Approach 2 core + Approach 1 modularity**

---

# 7. Critical Invariants (Non-negotiable)

If you are serious about trading infra:

### 1. Subscription State Must Be Source of Truth

```ts
Set<string> subscribedChannels
```

### 2. Reconnect MUST restore state

```ts
onReconnect → resubscribeAll()
```

### 3. Authentication must be idempotent

* No duplicate joins
* No race conditions

### 4. Event Normalization Layer

```ts
raw_event → domain_event
```

Example:

```
new-trade → trade | ltp (based on payload)
```

### 5. Liveness Detection

* Socket connected ≠ stream alive
* Need heartbeat + stale detection

---

# 8. What You're Missing (Critical for Trading)

Both approaches miss:

### ❌ Sequence Handling

* Depth updates need ordering

### ❌ Snapshot + Delta Merge

* Orderbook correctness

### ❌ Latency Tracking

* Event timestamp vs receive time

### ❌ Backpressure Control

* Burst trades → memory blowup

### ❌ Failover Strategy

* Multiple endpoints (if supported)

---

# 9. Mapping to Your Existing System (Important)

This should plug into your:

* `Dhan::Ws::FeedListener` equivalent
* `ActiveCache`
* `Positions::Manager`
* `Orders::Analyzer`

### Suggested Interface

```ts
ws.on('trade', handler)
ws.on('depth', handler)
ws.on('candle', handler)
ws.on('position', handler)
```

Then pipe into:

```
WebSocket → EventRouter → Cache → Strategy Engine → Execution
```

---

# 10. Final Verdict

* These are **not just two approaches for spot vs futures**
* They represent:

  * **(1) SDK wrapper**
  * **(2) Trading engine**

### You need:

> **A unified, stateful, event-driven WebSocket engine with pluggable market adapters**

---

If you want next step, I’ll give you:

**→ A production-grade TypeScript implementation aligned to your Rails event-driven trading system (with cache + strategy hooks)**

CoinDCX’s API reference already exposes authenticated wallet-transfer and futures-wallet endpoints with `X-AUTH-APIKEY` and `X-AUTH-SIGNATURE`, so the websocket layer should be treated as a normalized market-data/event stream that your Rails side can reconcile with wallet, order, and position state. ([CoinDCX Docs][1])

## Design decision

Build this as:

* a **stateful websocket engine**
* a **market-state cache**
* a **strategy hook pipeline**
* an optional **Rails event sink**

That gives you one ingestion layer for spot and futures, while Rails remains the source of truth for orchestration and persistence.

---

## Package layout

```text
coindcx-stream/
├── src/
│   ├── auth/AuthProvider.ts
│   ├── cache/MarketStateCache.ts
│   ├── cache/InMemoryMarketStateCache.ts
│   ├── sinks/SignalSink.ts
│   ├── strategies/StrategyHook.ts
│   ├── types.ts
│   ├── utils/normalize.ts
│   ├── CoinDCXEngine.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## `src/types.ts`

```ts
export type MarketKind = "spot" | "futures";
export type ChannelKind = "public" | "private";

export interface CoinDCXEngineConfig {
  endpoint?: string;
  apiKey?: string;
  secret?: string;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
  heartbeatMs?: number;
  connectTimeoutMs?: number;
  market: MarketKind;
}

export interface SymbolRef {
  market: MarketKind;
  symbol: string;
}

export interface DepthLevel {
  price: number;
  quantity: number;
}

export interface NormalizedTick extends SymbolRef {
  ts: number;
  price: number;
  source: string;
  raw: unknown;
}

export interface NormalizedTrade extends SymbolRef {
  ts: number;
  price: number;
  quantity: number;
  isBuyerMaker?: boolean;
  source: string;
  raw: unknown;
}

export interface NormalizedLtp extends SymbolRef {
  ts: number;
  price: number;
  source: string;
  raw: unknown;
}

export interface NormalizedCandle extends SymbolRef {
  interval: string;
  openTime: number;
  closeTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
  raw: unknown;
}

export interface NormalizedDepthSnapshot extends SymbolRef {
  ts: number;
  asks: DepthLevel[];
  bids: DepthLevel[];
  source: string;
  raw: unknown;
}

export interface BalanceUpdate {
  currency_short_name: string;
  balance: string | number;
  locked_balance?: string | number;
  [key: string]: unknown;
}

export interface OrderUpdate {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

export interface PositionUpdate {
  id?: string;
  pair?: string;
  [key: string]: unknown;
}

export interface SignalIntent extends SymbolRef {
  ts: number;
  side: "buy" | "sell";
  confidence: number;
  reason: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  metadata?: Record<string, unknown>;
}

export type EngineEvents = {
  connected: [];
  disconnected: [reason: string];
  reconnecting: [attempt: number];
  reconnect_failed: [];
  authenticated: [];
  subscribed: [channel: string];
  unsubscribed: [channel: string];
  error: [error: Error];
  tick: [tick: NormalizedTick];
  trade: [trade: NormalizedTrade];
  ltp: [ltp: NormalizedLtp];
  candle: [candle: NormalizedCandle];
  depth_snapshot: [snapshot: NormalizedDepthSnapshot];
  balance: [balances: BalanceUpdate[]];
  order: [orders: OrderUpdate[]];
  position: [positions: PositionUpdate[]];
  signal: [intent: SignalIntent];
};
```

---

## `src/auth/AuthProvider.ts`

```ts
import { createHmac } from "crypto";

export interface JoinAuthPayload {
  channelName: string;
  apiKey: string;
  authSignature: string;
  timestamp?: number;
}

export interface AuthProvider {
  buildJoinPayload(channelName: string): JoinAuthPayload;
}

export class DefaultAuthProvider implements AuthProvider {
  constructor(
    private readonly apiKey: string,
    private readonly secret: string
  ) {}

  buildJoinPayload(channelName: string): JoinAuthPayload {
    const body = { channel: channelName };
    const payload = JSON.stringify(body);
    const signature = createHmac("sha256", this.secret)
      .update(Buffer.from(payload).toString())
      .digest("hex");

    return {
      channelName,
      apiKey: this.apiKey,
      authSignature: signature,
      timestamp: Date.now(),
    };
  }
}
```

---

## `src/cache/MarketStateCache.ts`

```ts
import {
  BalanceUpdate,
  NormalizedCandle,
  NormalizedDepthSnapshot,
  NormalizedLtp,
  NormalizedTick,
  NormalizedTrade,
  OrderUpdate,
  PositionUpdate,
  SymbolRef,
} from "../types";

export interface SymbolState {
  lastTick?: NormalizedTick;
  lastTrade?: NormalizedTrade;
  lastLtp?: NormalizedLtp;
  lastCandle?: NormalizedCandle;
  lastDepthSnapshot?: NormalizedDepthSnapshot;
  updatedAt: number;
}

export interface MarketStateCache {
  upsertTick(tick: NormalizedTick): void;
  upsertTrade(trade: NormalizedTrade): void;
  upsertLtp(ltp: NormalizedLtp): void;
  upsertCandle(candle: NormalizedCandle): void;
  upsertDepthSnapshot(snapshot: NormalizedDepthSnapshot): void;

  setBalances(balances: BalanceUpdate[]): void;
  setOrders(orders: OrderUpdate[]): void;
  setPositions(positions: PositionUpdate[]): void;

  getSymbolState(ref: SymbolRef): SymbolState | undefined;
  getBalances(): BalanceUpdate[];
  getOrders(): OrderUpdate[];
  getPositions(): PositionUpdate[];
}

export const symbolKey = (ref: SymbolRef): string => `${ref.market}:${ref.symbol}`;
```

---

## `src/cache/InMemoryMarketStateCache.ts`

```ts
import {
  BalanceUpdate,
  NormalizedCandle,
  NormalizedDepthSnapshot,
  NormalizedLtp,
  NormalizedTick,
  NormalizedTrade,
  OrderUpdate,
  PositionUpdate,
  SymbolRef,
} from "../types";
import { MarketStateCache, SymbolState, symbolKey } from "./MarketStateCache";

export class InMemoryMarketStateCache implements MarketStateCache {
  private readonly symbols = new Map<string, SymbolState>();
  private balances: BalanceUpdate[] = [];
  private orders: OrderUpdate[] = [];
  private positions: PositionUpdate[] = [];

  upsertTick(tick: NormalizedTick): void {
    this.ensureState(tick).lastTick = tick;
    this.ensureState(tick).updatedAt = Date.now();
  }

  upsertTrade(trade: NormalizedTrade): void {
    this.ensureState(trade).lastTrade = trade;
    this.ensureState(trade).updatedAt = Date.now();
  }

  upsertLtp(ltp: NormalizedLtp): void {
    this.ensureState(ltp).lastLtp = ltp;
    this.ensureState(ltp).updatedAt = Date.now();
  }

  upsertCandle(candle: NormalizedCandle): void {
    this.ensureState(candle).lastCandle = candle;
    this.ensureState(candle).updatedAt = Date.now();
  }

  upsertDepthSnapshot(snapshot: NormalizedDepthSnapshot): void {
    this.ensureState(snapshot).lastDepthSnapshot = snapshot;
    this.ensureState(snapshot).updatedAt = Date.now();
  }

  setBalances(balances: BalanceUpdate[]): void {
    this.balances = balances;
  }

  setOrders(orders: OrderUpdate[]): void {
    this.orders = orders;
  }

  setPositions(positions: PositionUpdate[]): void {
    this.positions = positions;
  }

  getSymbolState(ref: SymbolRef): SymbolState | undefined {
    return this.symbols.get(symbolKey(ref));
  }

  getBalances(): BalanceUpdate[] {
    return this.balances;
  }

  getOrders(): OrderUpdate[] {
    return this.orders;
  }

  getPositions(): PositionUpdate[] {
    return this.positions;
  }

  private ensureState(ref: SymbolRef): SymbolState {
    const key = symbolKey(ref);
    let state = this.symbols.get(key);

    if (!state) {
      state = { updatedAt: Date.now() };
      this.symbols.set(key, state);
    }

    return state;
  }
}
```

---

## `src/strategies/StrategyHook.ts`

```ts
import {
  NormalizedCandle,
  NormalizedDepthSnapshot,
  NormalizedLtp,
  NormalizedTick,
  NormalizedTrade,
  SignalIntent,
} from "../types";
import { MarketStateCache } from "../cache/MarketStateCache";
import { SignalSink } from "../sinks/SignalSink";

export interface StrategyContext {
  cache: MarketStateCache;
  publishSignal: (intent: SignalIntent) => Promise<void>;
}

export interface StrategyHook {
  name: string;

  onTick?(tick: NormalizedTick, ctx: StrategyContext): Promise<void> | void;
  onTrade?(trade: NormalizedTrade, ctx: StrategyContext): Promise<void> | void;
  onLtp?(ltp: NormalizedLtp, ctx: StrategyContext): Promise<void> | void;
  onCandle?(candle: NormalizedCandle, ctx: StrategyContext): Promise<void> | void;
  onDepth?(snapshot: NormalizedDepthSnapshot, ctx: StrategyContext): Promise<void> | void;
}

export function createStrategyContext(
  cache: MarketStateCache,
  sink?: SignalSink
): StrategyContext {
  return {
    cache,
    publishSignal: async (intent: SignalIntent) => {
      if (sink) {
        await sink.publish(intent);
      }
    },
  };
}
```

---

## `src/sinks/SignalSink.ts`

```ts
import { SignalIntent } from "../types";

export interface SignalSink {
  publish(intent: SignalIntent): Promise<void>;
}

export class ConsoleSignalSink implements SignalSink {
  async publish(intent: SignalIntent): Promise<void> {
    console.log("[signal]", JSON.stringify(intent));
  }
}
```

---

## `src/utils/normalize.ts`

```ts
import {
  DepthLevel,
  NormalizedCandle,
  NormalizedDepthSnapshot,
  NormalizedLtp,
  NormalizedTick,
  NormalizedTrade,
} from "../types";

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return NaN;
}

export function sortDepthLevels(levels: DepthLevel[], side: "asks" | "bids"): DepthLevel[] {
  const copy = [...levels].filter((x) => Number.isFinite(x.price) && Number.isFinite(x.quantity));
  copy.sort((a, b) => (side === "asks" ? a.price - b.price : b.price - a.price));
  return copy;
}

export function normalizeDepthRecord(
  input: any,
  market: "spot" | "futures",
  symbol: string,
  source: string
): NormalizedDepthSnapshot {
  const asks: DepthLevel[] = [];
  const bids: DepthLevel[] = [];

  const rawAsks = input?.asks ?? input?.a ?? {};
  const rawBids = input?.bids ?? input?.b ?? {};

  for (const [price, qty] of Object.entries(rawAsks || {})) {
    asks.push({ price: toNumber(price), quantity: toNumber(qty) });
  }
  for (const [price, qty] of Object.entries(rawBids || {})) {
    bids.push({ price: toNumber(price), quantity: toNumber(qty) });
  }

  return {
    market,
    symbol,
    ts: toNumber(input?.ts ?? input?.T ?? Date.now()),
    asks: sortDepthLevels(asks, "asks"),
    bids: sortDepthLevels(bids, "bids"),
    source,
    raw: input,
  };
}

export function normalizeTradeRecord(
  input: any,
  market: "spot" | "futures",
  symbol: string,
  source: string
): NormalizedTrade {
  return {
    market,
    symbol,
    ts: toNumber(input?.T ?? input?.ts ?? Date.now()),
    price: toNumber(input?.p ?? input?.price),
    quantity: toNumber(input?.q ?? input?.qty ?? input?.quantity),
    isBuyerMaker: typeof input?.m === "boolean" ? input.m : input?.m === 1,
    source,
    raw: input,
  };
}

export function normalizeLtpRecord(
  input: any,
  market: "spot" | "futures",
  symbol: string,
  source: string
): NormalizedLtp {
  return {
    market,
    symbol,
    ts: toNumber(input?.ts ?? input?.T ?? Date.now()),
    price: toNumber(input?.p ?? input?.price),
    source,
    raw: input,
  };
}

export function normalizeTickRecord(
  input: any,
  market: "spot" | "futures",
  symbol: string,
  source: string
): NormalizedTick {
  return {
    market,
    symbol,
    ts: toNumber(input?.ts ?? input?.T ?? Date.now()),
    price: toNumber(input?.p ?? input?.price),
    source,
    raw: input,
  };
}

export function normalizeCandleRecord(
  input: any,
  market: "spot" | "futures",
  symbol: string,
  interval: string,
  source: string
): NormalizedCandle {
  return {
    market,
    symbol,
    interval,
    openTime: toNumber(input?.open_time ?? input?.t ?? input?.T ?? Date.now()),
    closeTime: Number.isFinite(toNumber(input?.close_time)) ? toNumber(input?.close_time) : undefined,
    open: toNumber(input?.open),
    high: toNumber(input?.high),
    low: toNumber(input?.low),
    close: toNumber(input?.close),
    volume: toNumber(input?.volume),
    source,
    raw: input,
  };
}
```

---

## `src/CoinDCXEngine.ts`

```ts
import io, { Socket } from "socket.io-client";
import { EventEmitter } from "events";
import { createHmac } from "crypto";
import {
  CoinDCXEngineConfig,
  EngineEvents,
  MarketKind,
  SignalIntent,
} from "./types";
import { DefaultAuthProvider, AuthProvider } from "./auth/AuthProvider";
import { MarketStateCache } from "./cache/MarketStateCache";
import { InMemoryMarketStateCache } from "./cache/InMemoryMarketStateCache";
import { createStrategyContext, StrategyHook } from "./strategies/StrategyHook";
import {
  normalizeCandleRecord,
  normalizeDepthRecord,
  normalizeLtpRecord,
  normalizeTickRecord,
  normalizeTradeRecord,
} from "./utils/normalize";
import { SignalSink } from "./sinks/SignalSink";

type ListenerMap = {
  [K in keyof EngineEvents]: (...args: EngineEvents[K]) => void;
};

class TypedEventEmitter extends EventEmitter {
  override on<K extends keyof EngineEvents>(event: K, listener: ListenerMap[K]): this {
    return super.on(event as string, listener as (...args: any[]) => void);
  }

  override off<K extends keyof EngineEvents>(event: K, listener: ListenerMap[K]): this {
    return super.off(event as string, listener as (...args: any[]) => void);
  }

  override emit<K extends keyof EngineEvents>(event: K, ...args: EngineEvents[K]): boolean {
    return super.emit(event as string, ...args);
  }
}

interface SubRecord {
  channelName: string;
  auth?: Record<string, unknown>;
}

export class CoinDCXEngine extends TypedEventEmitter {
  private socket: Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private connected = false;
  private authenticating = false;
  private connecting = false;

  private readonly subscriptions = new Map<string, SubRecord>();

  constructor(
    private readonly config: CoinDCXEngineConfig,
    private readonly cache: MarketStateCache = new InMemoryMarketStateCache(),
    private readonly strategyHooks: StrategyHook[] = [],
    private readonly signalSink?: SignalSink,
    private readonly authProvider?: AuthProvider
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connecting) return;
    if (this.socket?.connected) return;

    this.connecting = true;

    const endpoint = this.config.endpoint ?? "wss://stream.coindcx.com";

    this.socket = io(endpoint, {
      transports: ["websocket"],
      reconnection: false,
      timeout: this.config.connectTimeoutMs ?? 10_000,
    });

    this.registerSocketListeners();

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.socket?.off("connect", onConnect);
        this.socket?.off("connect_error", onError);
      };

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      this.socket!.once("connect", onConnect);
      this.socket!.once("connect_error", onError);
    });

    this.connecting = false;
  }

  disconnect(): void {
    this.cleanupTimers();
    this.connected = false;
    this.connecting = false;

    this.socket?.disconnect();
    this.socket = null;

    this.emit("disconnected", "manual");
  }

  subscribePublic(channelName: string): void {
    this.join(channelName);
  }

  subscribePrivate(channelName = "coindcx"): void {
    if (!this.authProvider && !this.config.apiKey) {
      throw new Error("API credentials required for private subscription");
    }

    const auth = this.authProvider
      ? this.authProvider.buildJoinPayload(channelName)
      : new DefaultAuthProvider(this.config.apiKey!, this.config.secret!).buildJoinPayload(channelName);

    this.join(channelName, auth);
  }

  unsubscribe(channelName: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit("leave", { channelName });
    this.subscriptions.delete(channelName);
    this.emit("unsubscribed", channelName);
  }

  subscribeCandle(symbol: string, interval: string): void {
    const channel = this.config.market === "futures"
      ? `${symbol}_${interval}-futures`
      : `${symbol}_${interval}`;
    this.subscribePublic(channel);
  }

  subscribeDepth(symbol: string, depth: 10 | 20 | 50 = 20): void {
    const channel = this.config.market === "futures"
      ? `${symbol}@orderbook@${depth}-futures`
      : `${symbol}@orderbook@${depth}`;
    this.subscribePublic(channel);
  }

  subscribeTrades(symbol: string): void {
    const channel = this.config.market === "futures"
      ? `${symbol}@trades-futures`
      : `${symbol}@trades`;
    this.subscribePublic(channel);
  }

  subscribeLtp(symbol: string): void {
    const channel = this.config.market === "futures"
      ? `${symbol}@prices-futures`
      : `${symbol}@prices`;
    this.subscribePublic(channel);
  }

  subscribeCurrentPrices(): void {
    const channel = this.config.market === "futures"
      ? "currentPrices@futures@rt"
      : "currentPrices@spot@rt";
    this.subscribePublic(channel);
  }

  get isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  private join(channelName: string, auth?: Record<string, unknown>): void {
    if (!this.socket?.connected) {
      throw new Error("WebSocket is not connected");
    }

    if (this.subscriptions.has(channelName)) return;

    const payload = auth
      ? { channelName, ...auth }
      : { channelName };

    this.socket.emit("join", payload);
    this.subscriptions.set(channelName, { channelName, auth });
    this.emit("subscribed", channelName);
  }

  private registerSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.emit("connected");

      try {
        this.restoreSubscriptions();
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }

      this.startHeartbeat();
    });

    this.socket.on("disconnect", (reason: string) => {
      this.connected = false;
      this.authenticating = false;
      this.stopHeartbeat();
      this.emit("disconnected", reason);

      if (this.config.autoReconnect ?? true) {
        this.scheduleReconnect();
      }
    });

    this.socket.on("connect_error", (err: Error) => {
      this.emit("error", err);
      if (!this.connected) {
        this.scheduleReconnect();
      }
    });

    this.socket.on("error", (err: unknown) => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    });

    this.registerMarketListeners();
  }

  private registerMarketListeners(): void {
    if (!this.socket) return;

    this.socket.on("balance-update", (payload: any) => {
      const balances = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
      this.cache.setBalances(balances);
      this.emit("balance", balances);
      void this.notifyStrategies("balance");
    });

    this.socket.on("order-update", (payload: any) => {
      const orders = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
      this.cache.setOrders(orders);
      this.emit("order", orders);
      void this.notifyStrategies("order");
    });

    this.socket.on("df-position-update", (payload: any) => {
      const positions = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
      this.cache.setPositions(positions);
      this.emit("position", positions);
      void this.notifyStrategies("position");
    });

    this.socket.on("candlestick", (payload: any) => {
      const candle = normalizeCandleRecord(
        payload?.data ?? payload,
        this.config.market,
        payload?.symbol ?? payload?.s ?? payload?.pair ?? "unknown",
        payload?.channel ?? "candlestick"
      );

      this.cache.upsertCandle(candle);
      this.emit("candle", candle);
      void this.notifyStrategies("candle", candle);
    });

    this.socket.on("depth-snapshot", (payload: any) => {
      const snapshot = normalizeDepthRecord(
        payload?.data ?? payload,
        this.config.market,
        payload?.symbol ?? payload?.s ?? payload?.pair ?? "unknown",
        payload?.channel ?? "depth-snapshot"
      );

      this.cache.upsertDepthSnapshot(snapshot);
      this.emit("depth_snapshot", snapshot);
      void this.notifyStrategies("depth", snapshot);
    });

    this.socket.on("depth-update", (payload: any) => {
      const snapshot = normalizeDepthRecord(
        payload?.data ?? payload,
        this.config.market,
        payload?.symbol ?? payload?.s ?? payload?.pair ?? "unknown",
        payload?.channel ?? "depth-update"
      );

      this.cache.upsertDepthSnapshot(snapshot);
      this.emit("depth_snapshot", snapshot);
      void this.notifyStrategies("depth", snapshot);
    });

    this.socket.on("new-trade", (payload: any) => {
      const trade = normalizeTradeRecord(
        payload?.data ?? payload,
        this.config.market,
        payload?.symbol ?? payload?.s ?? payload?.pair ?? "unknown",
        payload?.channel ?? "new-trade"
      );

      this.cache.upsertTrade(trade);
      this.emit("trade", trade);
      void this.notifyStrategies("trade", trade);
    });

    this.socket.on("price-change", (payload: any) => {
      const ltp = normalizeLtpRecord(
        payload?.data ?? payload,
        this.config.market,
        payload?.symbol ?? payload?.s ?? payload?.pair ?? "unknown",
        payload?.channel ?? "price-change"
      );

      this.cache.upsertLtp(ltp);
      this.emit("ltp", ltp);
      void this.notifyStrategies("ltp", ltp);
    });

    this.socket.on("currentPrices@spot#update", (payload: any) => {
      const tick = normalizeTickRecord(
        payload?.data ?? payload,
        "spot",
        payload?.symbol ?? payload?.s ?? "unknown",
        payload?.channel ?? "currentPrices@spot#update"
      );

      this.cache.upsertTick(tick);
      this.emit("tick", tick);
      void this.notifyStrategies("tick", tick);
    });

    this.socket.on("currentPrices@futures#update", (payload: any) => {
      const tick = normalizeTickRecord(
        payload?.data ?? payload,
        "futures",
        payload?.symbol ?? payload?.s ?? "unknown",
        payload?.channel ?? "currentPrices@futures#update"
      );

      this.cache.upsertTick(tick);
      this.emit("tick", tick);
      void this.notifyStrategies("tick", tick);
    });
  }

  private restoreSubscriptions(): void {
    if (!this.socket?.connected) return;

    for (const [channelName, sub] of this.subscriptions.entries()) {
      if (sub.auth && channelName === "coindcx") {
        if (this.authenticating) continue;
        this.authenticating = true;
        this.socket.emit("join", { channelName, ...sub.auth });
        this.authenticating = false;
        continue;
      }

      this.socket.emit("join", { channelName, ...(sub.auth ?? {}) });
    }

    if (this.subscriptions.size > 0) {
      this.emit("authenticated");
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const maxAttempts = this.config.reconnectAttempts ?? 10;
    if (this.reconnectAttempt >= maxAttempts) {
      this.emit("reconnect_failed");
      return;
    }

    const baseDelay = this.config.reconnectDelayMs ?? 2000;
    const delay = baseDelay * Math.pow(2, this.reconnectAttempt);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAttempt += 1;
      this.emit("reconnecting", this.reconnectAttempt);

      try {
        await this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    const interval = this.config.heartbeatMs ?? 15_000;
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket?.connected) return;
      this.socket.emit("ping", { ts: Date.now() });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanupTimers(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async notifyStrategies(
    kind: "tick" | "trade" | "ltp" | "candle" | "depth" | "balance" | "order" | "position",
    payload?: unknown
  ): Promise<void> {
    const ctx = createStrategyContext(this.cache, this.signalSink);

    for (const strategy of this.strategyHooks) {
      try {
        if (kind === "tick" && strategy.onTick && payload) await strategy.onTick(payload as any, ctx);
        if (kind === "trade" && strategy.onTrade && payload) await strategy.onTrade(payload as any, ctx);
        if (kind === "ltp" && strategy.onLtp && payload) await strategy.onLtp(payload as any, ctx);
        if (kind === "candle" && strategy.onCandle && payload) await strategy.onCandle(payload as any, ctx);
        if (kind === "depth" && strategy.onDepth && payload) await strategy.onDepth(payload as any, ctx);
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}
```

---

## `src/index.ts`

```ts
export * from "./types";
export * from "./auth/AuthProvider";
export * from "./cache/MarketStateCache";
export * from "./cache/InMemoryMarketStateCache";
export * from "./sinks/SignalSink";
export * from "./strategies/StrategyHook";
export * from "./CoinDCXEngine";
```

---

## Rails-aligned usage

### 1) Start the websocket service

```ts
import {
  CoinDCXEngine,
  InMemoryMarketStateCache,
  ConsoleSignalSink,
} from "./src";

const cache = new InMemoryMarketStateCache();

const engine = new CoinDCXEngine(
  {
    endpoint: "wss://stream.coindcx.com",
    apiKey: process.env.COINDCX_API_KEY,
    secret: process.env.COINDCX_API_SECRET,
    market: "futures",
    autoReconnect: true,
    reconnectAttempts: 10,
    reconnectDelayMs: 2000,
    heartbeatMs: 15000,
  },
  cache,
  [],
  new ConsoleSignalSink()
);

engine.on("connected", () => console.log("connected"));
engine.on("error", (err) => console.error(err));

await engine.connect();

engine.subscribePrivate("coindcx");
engine.subscribeCandle("B-BTC_USDT", "1m");
engine.subscribeDepth("B-BTC_USDT", 20);
engine.subscribeTrades("B-BTC_USDT");
engine.subscribeLtp("B-BTC_USDT");
engine.subscribeCurrentPrices();
```

### 2) Strategy hook that emits a signal back to Rails

```ts
import { StrategyHook } from "./src";
import { SignalIntent } from "./src";

export const breakoutHook: StrategyHook = {
  name: "breakout_hook",

  async onCandle(candle, ctx) {
    const state = ctx.cache.getSymbolState({
      market: candle.market,
      symbol: candle.symbol,
    });

    if (!state?.lastCandle) return;

    const prev = state.lastCandle;
    const breakout = candle.close > prev.high;

    if (!breakout) return;

    const intent: SignalIntent = {
      market: candle.market,
      symbol: candle.symbol,
      ts: Date.now(),
      side: "buy",
      confidence: 0.72,
      reason: "1m close above prior high",
      entry: candle.close,
      stopLoss: candle.low,
      takeProfit: candle.close + (candle.close - candle.low) * 2,
      metadata: {
        interval: candle.interval,
      },
    };

    await ctx.publishSignal(intent);
  },
};
```

---

## Rails integration pattern

Your Rails app should consume the emitted `signal` payloads and persist them into the same event flow you already use for positions, orders, and analysis. Keep the TypeScript process focused on ingestion and normalization; keep execution and durable orchestration in Rails.

A clean bridge is:

```text
CoinDCX WebSocket -> TS normalization -> Signal/Event sink -> Rails API -> Rails cache / jobs / strategy executor
```

---

## Critical risks

### 1) Join/auth contract

The websocket join payload shape must match CoinDCX’s live contract. The engine above keeps it isolated in `AuthProvider`, so you can patch that without touching transport or strategy code.

### 2) Reconnect duplication

Do not resubscribe blindly without a registry. The `subscriptions` map is the invariant that prevents duplicate joins.

### 3) Order book correctness

If you need deep book logic, snapshot + delta reconciliation must be added on top of `depth_snapshot` and `depth_update`. This engine gives you the hook point, not the merge policy.

### 4) Strategy isolation

Do not let strategies mutate websocket internals. They should only read from cache and emit `SignalIntent`.

---

## Verification checkpoints

* reconnect after forced socket drop and confirm subscriptions are restored once
* confirm `balance`, `order`, `position` updates are written to cache
* confirm `signal` events reach Rails
* confirm candle/depth/trade parsing works for both spot and futures channels
* confirm private subscription requires credentials

If you want the next step, I’ll turn this into a complete repo-grade package with tests, a Rails webhook sink, and a depth-delta reconciler.

[1]: https://docs.coindcx.com/?utm_source=chatgpt.com "Terms and Conditions – API Reference - CoinDCX"


