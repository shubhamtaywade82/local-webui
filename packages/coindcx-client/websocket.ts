import { io, Socket } from 'socket.io-client';
import type { OrderBook, WsCandle, WsTrade } from './types';

const WS_URL = 'wss://stream.coindcx.com';

export class CoinDCXWsClient {
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket?.connected) return;
    this.socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    this.socket.on('connect', () =>
      console.log('[coindcx-ws] connected')
    );
    this.socket.on('disconnect', (reason) =>
      console.log('[coindcx-ws] disconnected:', reason)
    );
    this.socket.on('connect_error', (err) =>
      console.error('[coindcx-ws] connect error:', err.message)
    );
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket?.connected === true;
  }

  subscribeCandles(
    pair: string,
    interval: string,
    cb: (c: WsCandle) => void,
  ): () => void {
    this.connect();
    const channel = `${pair}@kline_${interval}`;
    this.socket!.emit('subscribe', { channelList: [channel] });

    const handler = (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (String(d.pair ?? d.symbol ?? '') !== pair) return;
      cb({
        pair,
        timeframe: interval,
        open:   parseFloat(String(d.open ?? d.o ?? 0)),
        high:   parseFloat(String(d.high ?? d.h ?? 0)),
        low:    parseFloat(String(d.low  ?? d.l ?? 0)),
        close:  parseFloat(String(d.close ?? d.c ?? 0)),
        volume: parseFloat(String(d.volume ?? d.v ?? 0)),
        time:   typeof d.time === 'number' ? d.time
               : parseInt(String(d.time ?? d.t ?? '0'), 10),
      });
    };

    this.socket!.on(channel, handler);
    return () => {
      this.socket?.emit('unsubscribe', { channelList: [channel] });
      this.socket?.off(channel, handler);
    };
  }

  subscribeTrades(
    pair: string,
    cb: (t: WsTrade) => void,
  ): () => void {
    this.connect();
    const channel = `${pair}@trades`;
    this.socket!.emit('subscribe', { channelList: [channel] });

    const handler = (data: unknown) => {
      const d = data as Record<string, unknown>;
      cb({
        pair,
        price:     parseFloat(String(d.price ?? d.p ?? 0)),
        quantity:  parseFloat(String(d.quantity ?? d.q ?? 0)),
        side:      String(d.side ?? d.m ? 'sell' : 'buy') as 'buy' | 'sell',
        timestamp: typeof d.time === 'number' ? d.time
                  : parseInt(String(d.time ?? d.T ?? '0'), 10),
      });
    };

    this.socket!.on(channel, handler);
    return () => {
      this.socket?.emit('unsubscribe', { channelList: [channel] });
      this.socket?.off(channel, handler);
    };
  }

  // Order book updates are SNAPSHOT-ONLY — caller must always replace, never patch.
  subscribeOrderBook(
    pair: string,
    cb: (ob: OrderBook) => void,
  ): () => void {
    this.connect();
    const channel = `${pair}@depth`;
    this.socket!.emit('subscribe', { channelList: [channel] });

    const handler = (data: unknown) => {
      const d = data as Record<string, unknown>;
      // Full replacement — snapshot semantics as per CoinDCX docs
      cb({
        pair,
        bids:      (d.bids as Record<string, string>) ?? {},
        asks:      (d.asks as Record<string, string>) ?? {},
        timestamp: Date.now(),
      });
    };

    this.socket!.on(channel, handler);
    return () => {
      this.socket?.emit('unsubscribe', { channelList: [channel] });
      this.socket?.off(channel, handler);
    };
  }
}
