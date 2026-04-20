import type { WsCandle, WsTrade, OrderBook } from './types';
import type { StreamMarketKind } from './stream/types';
import { CoinDCXStreamEngine } from './stream/engine';
import type { CoinDCXStreamEngineConfig } from './stream/types';
import {
  candleChannel,
  orderbookChannel,
  tradesChannel,
} from './stream/channels';

export interface CoinDCXWsClientOptions {
  market?: StreamMarketKind;
  stream?: CoinDCXStreamEngineConfig;
}

/**
 * CoinDCX Socket.IO stream client (`join` / `leave`, socket.io-client v2).
 * Prefer channel helpers from `./stream/channels` when building custom subscriptions.
 */
export class CoinDCXWsClient {
  private readonly engine: CoinDCXStreamEngine;
  private readonly market: StreamMarketKind;

  constructor(options?: CoinDCXWsClientOptions) {
    this.market = options?.market ?? 'futures';
    this.engine = new CoinDCXStreamEngine({
      dualLegacyJoinDefault: false,
      ...options?.stream,
    });
    this.engine.on('engine:connected', () => console.log('[coindcx-ws] connected'));
    this.engine.on('engine:disconnected', (reason: string) =>
      console.log('[coindcx-ws] disconnected:', reason),
    );
    this.engine.on('engine:connect_error', (err: Error) =>
      console.error('[coindcx-ws] connect error:', err.message),
    );
  }

  connect(): void {
    void this.engine.connect().catch((err: Error) =>
      console.error('[coindcx-ws] connect error:', err.message),
    );
  }

  disconnect(): void {
    this.engine.clearSubscriptions();
    this.engine.disconnect();
  }

  isConnected(): boolean {
    return this.engine.isConnected();
  }

  subscribeCandles(pair: string, interval: string, cb: (c: WsCandle) => void): () => void {
    this.connect();
    const channel = candleChannel(pair, interval, this.market);
    this.engine.subscribe(channel);

    const handler = (data: unknown) => {
      const raw = data as Record<string, unknown>;
      const ch = String(raw.channel ?? '');
      if (ch && ch !== channel) return;

      const rowSource = raw.data;
      const d = (Array.isArray(rowSource) ? rowSource[0] : rowSource) as Record<string, unknown>;
      if (!d || typeof d !== 'object') return;

      const sym = String(d.pair ?? d.symbol ?? pair);
      if (sym && sym !== pair) return;

      cb({
        pair,
        timeframe: interval,
        open: parseFloat(String(d.open ?? d.o ?? 0)),
        high: parseFloat(String(d.high ?? d.h ?? 0)),
        low: parseFloat(String(d.low ?? d.l ?? 0)),
        close: parseFloat(String(d.close ?? d.c ?? 0)),
        volume: parseFloat(String(d.volume ?? d.v ?? 0)),
        time:
          typeof d.time === 'number'
            ? d.time
            : parseInt(String(d.time ?? d.t ?? d.open_time ?? '0'), 10),
      });
    };

    this.engine.on('candlestick', handler);
    return () => {
      this.engine.off('candlestick', handler);
      this.engine.unsubscribe(channel);
    };
  }

  subscribeTrades(pair: string, cb: (t: WsTrade) => void): () => void {
    this.connect();
    const channel = tradesChannel(pair, this.market);
    this.engine.subscribe(channel);

    const handler = (data: unknown) => {
      const raw = data as Record<string, unknown>;
      const sym = String(raw.s ?? raw.symbol ?? raw.pair ?? '');
      if (sym && sym !== pair) return;

      const inner = (raw.data ?? raw) as Record<string, unknown>;
      const d = (typeof inner === 'object' && inner !== null ? inner : raw) as Record<string, unknown>;

      const sideRaw = d.side;
      if (typeof sideRaw === 'string' && (sideRaw === 'buy' || sideRaw === 'sell')) {
        cb({
          pair,
          price: parseFloat(String(d.p ?? d.price ?? 0)),
          quantity: parseFloat(String(d.q ?? d.quantity ?? 0)),
          side: sideRaw,
          timestamp:
            typeof d.T === 'number'
              ? d.T
              : typeof d.time === 'number'
                ? d.time
                : parseInt(String(d.ts ?? d.T ?? '0'), 10),
        });
        return;
      }
      const m = d.m;
      const aggressiveSell = m === 1 || m === '1';

      cb({
        pair,
        price: parseFloat(String(d.p ?? d.price ?? 0)),
        quantity: parseFloat(String(d.q ?? d.quantity ?? 0)),
        side: aggressiveSell ? 'sell' : 'buy',
        timestamp:
          typeof d.T === 'number'
            ? d.T
            : typeof d.time === 'number'
              ? d.time
              : parseInt(String(d.ts ?? d.T ?? '0'), 10),
      });
    };

    this.engine.on('new-trade', handler);
    return () => {
      this.engine.off('new-trade', handler);
      this.engine.unsubscribe(channel);
    };
  }

  /**
   * Order book updates are snapshot replacement semantics — caller must replace, not patch.
   */
  subscribeOrderBook(
    pair: string,
    cb: (ob: OrderBook) => void,
    depth: 10 | 20 | 50 = 20,
  ): () => void {
    this.connect();
    const channel = orderbookChannel(pair, depth, this.market);
    this.engine.subscribe(channel);

    const handler = (data: unknown) => {
      const raw = data as Record<string, unknown>;
      const inner = (raw.data ?? raw) as Record<string, unknown>;
      const d = (typeof inner === 'object' && inner !== null ? inner : raw) as Record<string, unknown>;

      const sym = String(d.pair ?? d.symbol ?? d.s ?? pair);
      if (sym && sym !== pair) return;

      cb({
        pair,
        bids: (d.bids as Record<string, string>) ?? (d.b as Record<string, string>) ?? {},
        asks: (d.asks as Record<string, string>) ?? (d.a as Record<string, string>) ?? {},
        timestamp:
          typeof d.ts === 'number' ? d.ts : typeof d.T === 'number' ? d.T : Date.now(),
      });
    };

    this.engine.on('depth-snapshot', handler);
    this.engine.on('depth-update', handler);
    return () => {
      this.engine.off('depth-snapshot', handler);
      this.engine.off('depth-update', handler);
      this.engine.unsubscribe(channel);
    };
  }
}
