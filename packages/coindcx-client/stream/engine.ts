/// <reference path="../socket-io-client-v2.d.ts" />
import io from 'socket.io-client-v2';
import { EventEmitter } from 'events';
import type { CoinDCXStreamEngineConfig, StreamSubscription } from './types';

const DEFAULT_ENDPOINT = 'wss://stream.coindcx.com';

/** Forwarded from CoinDCX socket for consumers (pulse, WS client, etc.). */
const FORWARDED_SOCKET_EVENTS = [
  'price-change',
  'prices',
  'currentPrices@futures#update',
  'currentPrices@spot#update',
  'candlestick',
  'depth-snapshot',
  'depth-update',
  'new-trade',
  'balance-update',
  'order-update',
  'df-position-update',
  'df-order-update',
] as const;

/**
 * Stateful Socket.IO client: subscription registry is source of truth; each `connect`
 * re-issues `join` for all subscriptions (reconnect-safe).
 */
export class CoinDCXStreamEngine extends EventEmitter {
  private socket: any = null;
  private readonly subscriptions = new Map<string, StreamSubscription>();
  private readonly dualLegacyJoinDefault: boolean;
  private readonly endpoint: string;
  private readonly ioOptions: Record<string, unknown>;

  constructor(config: CoinDCXStreamEngineConfig = {}) {
    super();
    this.dualLegacyJoinDefault = config.dualLegacyJoinDefault ?? false;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.ioOptions = {
      transports: config.transports ?? ['websocket'],
      timeout: config.timeout ?? 20_000,
      reconnection: config.reconnection ?? true,
      reconnectionDelay: config.reconnectionDelay ?? 1000,
      reconnectionAttempts: config.reconnectionAttempts ?? 10,
    };
  }

  isConnected(): boolean {
    return this.socket?.connected === true;
  }

  /** Escape hatch for legacy `onevent` patching (e.g. Market Pulse). */
  getRawSocket(): any {
    return this.socket;
  }

  subscribe(
    channelName: string,
    opts?: { dualLegacyJoin?: boolean; authFields?: Record<string, string> },
  ): void {
    const dualLegacyJoin =
      opts?.dualLegacyJoin ?? (opts?.authFields ? false : this.dualLegacyJoinDefault);
    this.subscriptions.set(channelName, {
      channelName,
      dualLegacyJoin,
      authFields: opts?.authFields,
    });
    if (this.socket?.connected) {
      this.emitJoin(this.subscriptions.get(channelName)!);
    }
  }

  unsubscribe(channelName: string): void {
    this.subscriptions.delete(channelName);
    if (!this.socket?.connected) return;
    this.socket.emit('leave', { channelName });
  }

  clearSubscriptions(): void {
    if (this.socket?.connected) {
      for (const name of this.subscriptions.keys()) {
        this.socket.emit('leave', { channelName: name });
      }
    }
    this.subscriptions.clear();
  }

  listSubscriptions(): ReadonlyMap<string, StreamSubscription> {
    return this.subscriptions;
  }

  connect(): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(this.endpoint, this.ioOptions);

    this.socket.on('connect', () => {
      this.emit('engine:connected');
      this.resubscribeAll();
    });

    this.socket.on('disconnect', (reason: string) => {
      this.emit('engine:disconnected', reason);
    });

    this.socket.on('connect_error', (err: Error) => {
      this.emit('engine:connect_error', err);
    });

    this.socket.on('error', (err: Error) => {
      this.emit('engine:error', err);
    });

    for (const ev of FORWARDED_SOCKET_EVENTS) {
      this.socket.on(ev, (data: unknown) => {
        this.emit(ev, data);
      });
    }

    if (this.socket.connected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', (err: Error) => reject(err));
    });
  }

  disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  private resubscribeAll(): void {
    if (!this.socket?.connected) return;
    for (const sub of this.subscriptions.values()) {
      this.emitJoin(sub);
    }
  }

  private emitJoin(sub: StreamSubscription): void {
    if (!this.socket?.connected) return;
    const { channelName, dualLegacyJoin, authFields } = sub;
    const base = { channelName, ...authFields };
    this.socket.emit('join', base);
    if (dualLegacyJoin && !authFields) {
      this.socket.emit('join', ['join', { channelName }]);
    }
  }
}
