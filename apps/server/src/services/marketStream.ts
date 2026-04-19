import {
  CoinDCXStreamEngine,
  futuresCurrentPricesRtChannel,
  futuresLtpChannel,
} from '@workspace/coindcx-client';
import { EventEmitter } from 'events';
import { WebSocketServer } from 'ws';

export interface PriceUpdate {
  sym: string;
  price: string;
  change: string;
  trend: 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bull';
  color: string;
}

type TickSource = 'stream' | 'poll' | 'rest';

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

/** Market Pulse grid only shows these bases — never emit updates with other `sym` keys. */
const PULSE_BASES = new Set(['BTC', 'ETH', 'SOL']);

class MarketStream extends EventEmitter {
  private engine: CoinDCXStreamEngine | null = null;
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
    if (this.wss) return;

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

    console.log('Starting CoinDCX Market Stream (shared CoinDCXStreamEngine, Socket.IO v2)');
    this.engine = new CoinDCXStreamEngine({
      dualLegacyJoinDefault: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    this.engine.on('engine:connect_error', (err: Error) => {
      console.error('CoinDCX Connection Error:', err.message);
    });

    this.engine.on('engine:connected', () => {
      console.log('Connected to CoinDCX stream; price subscriptions active');
    });

    this.engine.on('engine:disconnected', (reason: string) => {
      console.log('Disconnected from CoinDCX Market Stream:', reason);
    });

    this.engine.on('engine:error', (err: Error) => {
      console.error('Market Stream Error:', err);
    });

    this.engine.on('price-change', (data: unknown) => {
      this.handlePriceUpdate('price-change', data, 'stream');
    });

    this.engine.on('prices', (data: unknown) => {
      this.handlePriceUpdate('prices', data, 'stream');
    });

    this.engine.on('currentPrices@futures#update', (data: unknown) => {
      this.handlePriceUpdate('bulk-futures', data, 'stream');
    });

    for (const pair of this.targets) {
      this.engine.subscribe(futuresLtpChannel(pair));
    }
    this.engine.subscribe(futuresCurrentPricesRtChannel());

    void this.engine
      .connect()
      .then(() => this.installLegacyOneventTap())
      .catch((err: Error) => {
        console.error('CoinDCX StreamEngine connect failed:', err.message);
      });

    /** HTTP RT only when the Socket.IO feed has been quiet (backup / gap fill). */
    this.startFuturesRtPoll();
    this.startRestFallback();
  }

  private installLegacyOneventTap(): void {
    const anySocket = this.engine?.getRawSocket() as { onevent?: (packet: unknown) => void } | null;
    if (!anySocket?.onevent) return;

    const originalEmit = anySocket.onevent.bind(anySocket);
    anySocket.onevent = (packet: unknown) => {
      const p = packet as { data?: [string, unknown] };
      const tuple = p.data;
      if (Array.isArray(tuple) && tuple.length >= 2) {
        const [event, data] = tuple;
        if (typeof event === 'string' && !NOISE_EVENTS.has(event)) {
          if (event === 'price-change' || event === 'informant' || event.includes('update')) {
            this.handlePriceUpdate(event, data, 'stream');
          }
        }
      }
      originalEmit(packet);
    };
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

  /**
   * Resolve UI row key (BTC | ETH | SOL). Never use the Socket.IO event name (e.g. `price-change`) as a symbol.
   */
  private resolvePulseBase(data: Record<string, unknown>, event: string): string | null {
    const tryCandidate = (raw: unknown): string | null => {
      if (raw == null || raw === '') return null;
      const base = this.normalizeBaseSymbol(String(raw));
      return PULSE_BASES.has(base) ? base : null;
    };

    const payloadOrder: unknown[] = [
      data.market,
      data.sym,
      data.m,
      data.s,
      (data as { pair?: unknown }).pair,
      (data as { instrument?: unknown }).instrument,
      typeof data.channel === 'string' ? data.channel.split('@')[0] : null,
    ];
    for (const c of payloadOrder) {
      const hit = tryCandidate(c);
      if (hit) return hit;
    }

    const ev = String(event);
    for (const pair of this.targets) {
      if (ev.includes(pair)) return this.normalizeBaseSymbol(pair);
    }

    return null;
  }

  private handlePriceUpdate(event: string, data: any, source: TickSource) {
    if (!data) return;

    // Handle stringified nested data common in CoinDCX legacy protocol
    if (typeof data.data === 'string') {
      try {
        const nested = JSON.parse(data.data);
        this.handlePriceUpdate(event, nested, source);
        return;
      } catch {
        // Fall through
      }
    }
    
    // Diagnostic for stream silence
    if (source === 'stream') {
      // console.log(`[StreamDebug] Event: ${event}, Data:`, JSON.stringify(data).slice(0, 200));
    }

    try {
      if (Array.isArray(data)) {
        for (const item of data) {
          this.handlePriceUpdate(event, item, source);
        }
        return;
      }

      if (typeof data !== 'object') return;

      const row = data as Record<string, unknown>;
      const prices = row.prices;
      if (prices && typeof prices === 'object' && !Array.isArray(prices)) {
        const px = prices as Record<string, Record<string, unknown>>;
        for (const pair of this.targets) {
          const cell = px[pair];
          if (cell && typeof cell === 'object') {
            this.handlePriceUpdate(event, { ...cell, market: pair }, source);
          }
        }
        return;
      }

      const priceValue = this.parseFinitePrice(row);
      if (priceValue == null) return;

      const sym = this.resolvePulseBase(row, event);
      if (sym == null) return;

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
    this.engine?.disconnect();
    this.engine = null;

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
