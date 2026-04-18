import { io, type Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { WebSocketServer } from 'ws';

export interface PriceUpdate {
  sym: string;
  price: string;
  change: string;
  trend: 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bull';
  color: string;
}

const NOISE_EVENTS = new Set([
  'connect',
  'disconnect',
  'connect_error',
  'error',
  'ping',
  'pong',
  'reconnect',
  'reconnect_attempt',
  'reconnect_error',
  'reconnect_failed',
]);

type TickSource = 'stream' | 'poll' | 'rest';

class MarketStream extends EventEmitter {
  private socket: Socket | null = null;
  private wss: WebSocketServer | null = null;
  private latestPrices: Record<string, PriceUpdate> = {};
  private targets = ['B-BTC_USDT', 'B-ETH_USDT', 'B-SOL_USDT'] as const;
  private restInterval: ReturnType<typeof setInterval> | null = null;
  private rtPollInterval: ReturnType<typeof setInterval> | null = null;
  /** Last LTP we pushed from HTTP RT (dedupe poll-only). Stream ticks are never deduped. */
  private lastPollLs: Record<string, number> = {};
  /** Last time any CoinDCX stream-derived tick was applied (ms). */
  private lastStreamTickAt = 0;
  /** Skip HTTP RT when stream delivered a tick within this window (ms). */
  private readonly streamFreshMs = Math.max(
    2000,
    parseInt(String(process.env.MARKET_PULSE_STREAM_FRESH_MS ?? '5000'), 10) || 5000
  );

  constructor() {
    super();
  }

  start() {
    if (this.socket) return;

    this.wss = new WebSocketServer({ port: 4002 });

    this.wss.on('listening', () => {
      console.log('Alpha Pulse WS Relay listening on port 4002');
    });

    this.wss.on('error', (err) => {
      console.error('WSS Server Error (4002):', err);
    });

    this.wss.on('connection', (ws, req) => {
      console.log(`Terminal connected from ${req.socket.remoteAddress}`);

      ws.on('error', (err) => {
        console.error('WSS Client Socket Error:', err);
      });

      ws.on('close', (code, reason) => {
        console.log(`WSS Client Disconnected: ${code} ${reason}`);
      });

      const latest = this.getLatest();
      if (latest.length > 0) {
        ws.send(JSON.stringify({ type: 'initial', data: latest }));
      }
    });

    console.log('Starting CoinDCX Market Stream (socket.io-client v4 → wss://stream.coindcx.com)');
    this.socket = io('wss://stream.coindcx.com', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect_error', (err: Error) => {
      console.error('CoinDCX Connection Error:', err.message);
    });

    this.socket.on('connect', () => {
      console.log('Connected to CoinDCX stream; joining futures price channels');
      for (const channel of this.targets) {
        const channelName = `${channel}@prices-futures`;
        this.socket?.emit('join', { channelName });
      }
      this.socket?.emit('join', { channelName: 'currentPrices@futures@rt' });
    });

    /** Forward likely price events immediately (true tick path); ignore unrelated socket.io chatter. */
    this.socket.onAny((event, ...args) => {
      if (NOISE_EVENTS.has(event)) return;
      const el = String(event).toLowerCase();
      const looksLikePrice =
        el.includes('price') ||
        el.includes('futures') ||
        el.includes('ticker') ||
        el.includes('ltp') ||
        el.includes('trade') ||
        el.includes('informant') ||
        el.includes('prices') ||
        this.targets.some((t) => String(event).includes(t));
      if (!looksLikePrice) return;
      this.dispatchStreamArgs(event, args);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from CoinDCX Market Stream');
    });

    this.socket.on('error', (err: Error) => {
      console.error('Market Stream Error:', err);
    });

    /** HTTP RT only when the Socket.IO feed has been quiet (backup / gap fill). */
    this.startFuturesRtPoll();
    this.startRestFallback();
  }

  private dispatchStreamArgs(event: string, args: unknown[]): void {
    for (const arg of args) {
      if (arg == null) continue;
      if (Array.isArray(arg)) {
        for (const item of arg) {
          if (item != null && typeof item === 'object') {
            this.dispatchStreamObject(event, item as Record<string, unknown>);
          }
        }
        continue;
      }
      if (typeof arg === 'object') {
        this.dispatchStreamObject(event, arg as Record<string, unknown>);
      }
    }
  }

  /** Unwrap `prices` map from bulk RT-style payloads. */
  private dispatchStreamObject(event: string, o: Record<string, unknown>): void {
    const prices = o.prices;
    if (prices && typeof prices === 'object' && !Array.isArray(prices)) {
      const px = prices as Record<string, Record<string, unknown>>;
      for (const pair of this.targets) {
        const row = px[pair];
        if (row && typeof row === 'object') {
          this.handlePriceUpdate(event, { ...row, market: pair }, 'stream');
        }
      }
      return;
    }
    this.handlePriceUpdate(event, o, 'stream');
  }

  private startFuturesRtPoll() {
    const pollMs = Math.max(
      2000,
      parseInt(String(process.env.MARKET_PULSE_RT_FALLBACK_MS ?? '4000'), 10) || 4000
    );
    this.rtPollInterval = setInterval(() => {
      void this.pollFuturesRtOnce();
    }, pollMs);
    void this.pollFuturesRtOnce();
  }

  private async pollFuturesRtOnce(): Promise<void> {
    if (Date.now() - this.lastStreamTickAt < this.streamFreshMs) {
      return;
    }
    try {
      const res = await fetch('https://public.coindcx.com/market_data/v3/current_prices/futures/rt', {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { prices?: Record<string, Record<string, unknown>> };
      const prices = json.prices;
      if (!prices || typeof prices !== 'object') return;

      for (const pair of this.targets) {
        const row = prices[pair];
        if (!row || typeof row !== 'object') continue;
        const ls = parseFloat(String(row.ls ?? row.last_price ?? ''));
        if (!Number.isFinite(ls) || ls <= 0) continue;
        if (this.lastPollLs[pair] === ls) continue;
        this.lastPollLs[pair] = ls;
        const pc = parseFloat(String(row.pc ?? ''));
        this.handlePriceUpdate('futures-rt', {
          market: pair,
          ls,
          ...(Number.isFinite(pc) ? { change_24: pc } : {}),
        }, 'poll');
      }
    } catch {
      /* ignore */
    }
  }

  private startRestFallback() {
    this.restInterval = setInterval(async () => {
      try {
        const res = await fetch('https://api.coindcx.com/exchange/ticker');
        const tickers: any[] = await res.json();
        const targets = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

        tickers.forEach((t) => {
          if (!targets.includes(t.market)) return;
          const sym = t.market.replace('USDT', '');
          const lastNum = parseFloat(String(t.last_price));
          if (!Number.isFinite(lastNum)) return;

          const price = lastNum.toLocaleString(undefined, {
            minimumFractionDigits: sym === 'BTC' ? 1 : 2,
          });

          if (this.latestPrices[sym]?.price !== price) {
            this.handlePriceUpdate(
              `rest@${sym}`,
              {
                last_price: String(t.last_price),
                market: t.market,
                sym: `B-${sym}_USDT`,
                change_24: t.change_24_hour,
              },
              'rest'
            );
          }
        });
      } catch {
        /* ignore */
      }
    }, 60_000);
  }

  private parseFinitePrice(data: Record<string, unknown>): number | null {
    const keys = ['ls', 'p', 'last_price', 'lastPrice', 'price', 'mp', 'lp'] as const;
    for (const k of keys) {
      const raw = data[k];
      if (raw == null || raw === '') continue;
      if (typeof raw === 'object') continue;
      const s = String(raw).trim().replace(/^[$₹]/, '').replace(/,/g, '');
      const n = parseFloat(s);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  private normalizeBaseSymbol(raw: string): string {
    let s = String(raw).trim();
    s = s.replace(/^B-/i, '');
    s = s.replace(/_USDT$/i, '').replace(/USDT$/i, '');
    return s || 'BTC';
  }

  private handlePriceUpdate(event: string, data: any, source: TickSource) {
    if (!data) return;

    try {
      if (Array.isArray(data)) {
        for (const item of data) {
          this.handlePriceUpdate(event, item, source);
        }
        return;
      }

      if (typeof data !== 'object') return;

      const priceValue = this.parseFinitePrice(data as Record<string, unknown>);
      if (priceValue == null) return;

      const rawSym =
        (data.sym as string) ||
        (data.market as string) ||
        (data.m as string) ||
        (data.s as string) ||
        (typeof data.channel === 'string' ? data.channel.split('@')[0] : null) ||
        (typeof event === 'string' ? event.split('@')[0] : null) ||
        'B-BTC_USDT';
      const sym = this.normalizeBaseSymbol(rawSym);

      const price = priceValue.toLocaleString(undefined, {
        minimumFractionDigits: sym === 'BTC' ? 1 : 2,
      });

      const chgRaw =
        (data as { change_24?: unknown }).change_24 ?? (data as { change_24_hour?: unknown }).change_24_hour;
      const chgNum = parseFloat(String(chgRaw));
      const hasChg = Number.isFinite(chgNum);

      const update: PriceUpdate = {
        sym,
        price,
        change: hasChg ? `${chgNum > 0 ? '+' : ''}${chgNum.toFixed(1)}%` : '0.0%',
        trend: hasChg
          ? chgNum > 2
            ? 'Strong Bull'
            : chgNum > 0
              ? 'Bullish'
              : chgNum > -2
                ? 'Neutral'
                : 'Bearish'
          : 'Neutral',
        color: hasChg
          ? chgNum > 0
            ? 'var(--success)'
            : chgNum < -2
              ? 'var(--error)'
              : 'var(--warning)'
          : 'var(--text-primary)',
      };

      if (source === 'stream') {
        this.lastStreamTickAt = Date.now();
      }

      this.latestPrices[sym] = update;
      this.emit('update', update);

      this.wss?.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'update', data: update }));
        }
      });
    } catch (err) {
      console.error('Market Stream Parse Error:', err);
    }
  }

  getLatest() {
    return Object.values(this.latestPrices);
  }

  stop() {
    this.socket?.disconnect();
    this.socket = null;

    this.wss?.clients.forEach((client) => {
      client.terminate();
    });

    this.wss?.close();
    this.wss = null;

    if (this.restInterval) {
      clearInterval(this.restInterval);
      this.restInterval = null;
    }
    if (this.rtPollInterval) {
      clearInterval(this.rtPollInterval);
      this.rtPollInterval = null;
    }
  }
}

export const marketStream = new MarketStream();
