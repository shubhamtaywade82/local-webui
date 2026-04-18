/**
 * Server-side futures LTP monitor: level cross → MTF SMC → Telegram (LONG/SHORT only).
 *
 * **Watch levels:** Always derived from the latest LTF SMC bar (PDH/PDL/POC/VAH/VAL/order-block mids),
 * refreshed on `FUTURES_AUTOMATION_LEVEL_REFRESH_MS` — no manual price list.
 *
 * **LTP transport:** CoinDCX documents `wss://stream.coindcx.com` as Socket.IO (EIO framing), not a plain
 * JSON ticker WebSocket. Public futures LTP is reliably available from
 * `GET https://public.coindcx.com/market_data/v3/current_prices/futures/rt` (same as chat live context).
 * - `FUTURES_AUTOMATION_LTP_TRANSPORT=rt_poll` (default): poll that endpoint on `FUTURES_AUTOMATION_POLL_MS`.
 * - `FUTURES_AUTOMATION_LTP_TRANSPORT=native_ws`: use Node `WebSocket` to `FUTURES_AUTOMATION_WSS_URL` (e.g. your
 *   own bridge); messages must be JSON text containing `ls`, `last_price`, `last`, or `price`.
 */

import type { FastifyBaseLogger } from 'fastify';
import {
  fetchFuturesRtSnapshot,
  fetchPublicOhlcv,
  runSmcEngine,
  type Candle,
  type SmcConfig,
  toCoinDcxFuturesPair,
  deriveWatchLevelsFromBar,
  detectLevelCross,
  evaluateStrictAutomationTrade,
  sendTelegramTradeAlert,
  type LevelCrossKind,
} from '@workspace/tools';

let stopFn: (() => void) | null = null;

function envBool(name: string, defaultWhenUnset: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === '') return defaultWhenUnset;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const n = parseInt(String(process.env[name] ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseTransport(raw: string | undefined): 'rt_poll' | 'native_ws' {
  const t = String(raw ?? 'rt_poll').toLowerCase().trim();
  return t === 'native_ws' || t === 'websocket' ? 'native_ws' : 'rt_poll';
}

function toCandles(bars: Awaited<ReturnType<typeof fetchPublicOhlcv>>): Candle[] {
  return bars.map((b) => ({
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    time: b.time,
  }));
}

function extractPriceFromWsMessage(data: string): number | null {
  const s = String(data).trim();
  if (!s) return null;
  if (s[0] === '4' && s[1] === '2') {
    try {
      const payload = JSON.parse(s.slice(2));
      const inner = Array.isArray(payload) ? payload[1] : payload;
      if (inner && typeof inner === 'object') {
        const o = inner as Record<string, unknown>;
        const v = o.ls ?? o.last_price ?? o.last ?? o.price ?? o.p;
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        return Number.isFinite(n) ? n : null;
      }
    } catch {
      return null;
    }
  }
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    const nested = j.data && typeof j.data === 'object' ? (j.data as Record<string, unknown>) : j;
    const v =
      nested.ls ??
      nested.last_price ??
      nested.last ??
      nested.price ??
      (nested as { p?: unknown }).p;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function startFuturesAutomation(log: FastifyBaseLogger): void {
  if (stopFn) return;
  if (!envBool('FUTURES_AUTOMATION_ENABLED', false)) {
    log.info('Futures automation disabled (set FUTURES_AUTOMATION_ENABLED=true to enable)');
    return;
  }

  const symbolRaw = process.env.FUTURES_AUTOMATION_SYMBOL ?? 'BTC';
  let pair: string;
  try {
    pair = toCoinDcxFuturesPair(symbolRaw);
  } catch (e) {
    log.error({ err: e }, 'FUTURES_AUTOMATION_SYMBOL invalid');
    return;
  }

  const htfTf = process.env.FUTURES_AUTOMATION_HTF ?? '1h';
  const ltfTf = process.env.FUTURES_AUTOMATION_LTF ?? '15m';
  const limit = Math.min(500, envInt('FUTURES_AUTOMATION_LIMIT', 150));
  const pollMs = envInt('FUTURES_AUTOMATION_POLL_MS', 2_000);
  const cooldownMs = envInt('FUTURES_AUTOMATION_COOLDOWN_MS', 900_000);
  const levelRefreshMs = envInt('FUTURES_AUTOMATION_LEVEL_REFRESH_MS', 900_000);
  const transport = parseTransport(process.env.FUTURES_AUTOMATION_LTP_TRANSPORT);
  const wsUrl = process.env.FUTURES_AUTOMATION_WSS_URL?.trim() ?? '';

  const cfg: Partial<SmcConfig> = { fvgConfluence: false, bosRelaxed: false, pdLookback: 50 };

  let prevLtp: number | null = null;
  let watchLevels: number[] = [];
  let lastLevelRefresh = 0;
  let cooldownUntil = 0;
  let tickBusy = false;

  async function refreshWatchLevelsIfNeeded(now: number): Promise<void> {
    if (now - lastLevelRefresh < levelRefreshMs && watchLevels.length > 0) return;
    lastLevelRefresh = now;
    try {
      const ltfCandles = toCandles(await fetchPublicOhlcv(pair, ltfTf, limit, { signal: AbortSignal.timeout(12_000) }));
      if (!ltfCandles.length) {
        log.warn({ pair, ltfTf }, 'futures automation: no LTF candles for level derive');
        return;
      }
      const ltfLast = runSmcEngine(ltfCandles, cfg).at(-1);
      if (!ltfLast) return;
      watchLevels = deriveWatchLevelsFromBar(ltfLast);
      log.info({ pair, n: watchLevels.length, watchLevels }, 'futures automation watch levels refreshed');
    } catch (e) {
      log.warn({ err: e, pair }, 'futures automation level refresh failed');
    }
  }

  async function onLtpTick(curr: number, now: number): Promise<void> {
    if (!Number.isFinite(curr)) return;
    await refreshWatchLevelsIfNeeded(now);
    if (watchLevels.length === 0) {
      log.warn({ pair }, 'futures automation: no SMC-derived watch levels yet (need LTF candles + SMC context)');
    }

    if (prevLtp == null) {
      prevLtp = curr;
      return;
    }

    if (now < cooldownUntil) {
      prevLtp = curr;
      return;
    }

    let hit: { level: number; cross: LevelCrossKind } | null = null;
    for (const level of watchLevels) {
      const cross = detectLevelCross(prevLtp, curr, level);
      if (cross) {
        hit = { level, cross };
        break;
      }
    }

    if (!hit) {
      prevLtp = curr;
      return;
    }

    const { level, cross } = hit;

    try {
      const [htfCandles, ltfCandles] = await Promise.all([
        toCandles(await fetchPublicOhlcv(pair, htfTf, limit, { signal: AbortSignal.timeout(12_000) })),
        toCandles(await fetchPublicOhlcv(pair, ltfTf, limit, { signal: AbortSignal.timeout(12_000) })),
      ]);
      if (!htfCandles.length || !ltfCandles.length) {
        log.warn({ pair }, 'futures automation: SMC fetch had empty candles');
        prevLtp = curr;
        return;
      }
      const htfLast = runSmcEngine(htfCandles, cfg).at(-1);
      const ltfLast = runSmcEngine(ltfCandles, cfg).at(-1);
      if (!htfLast || !ltfLast) {
        prevLtp = curr;
        return;
      }

      const { decision, telegram } = evaluateStrictAutomationTrade(htfLast, ltfLast, pair, htfTf, ltfTf, curr);
      if (decision === 'NO_TRADE' || !telegram) {
        log.info({ pair, level, cross, decision }, 'futures automation level cross — SMC strict gate: no alert');
        prevLtp = curr;
        return;
      }

      const send = await sendTelegramTradeAlert({
        ...telegram,
        setupName: `${telegram.setupName} | cross ${cross} @ ${level}`,
      });
      if (!send.ok) {
        log.error({ err: send.error }, 'futures automation Telegram send failed');
        prevLtp = curr;
        return;
      }
      cooldownUntil = now + cooldownMs;
      log.info({ pair, level, cross, decision }, 'futures automation Telegram alert sent');
    } catch (e) {
      log.error({ err: e, pair, level }, 'futures automation SMC/Telegram pipeline error');
    }
    prevLtp = curr;
  }

  const cleanups: Array<() => void> = [];

  if (transport === 'native_ws' && wsUrl) {
    try {
      const ws = new WebSocket(wsUrl);
      ws.addEventListener('message', (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : '';
        const price = extractPriceFromWsMessage(raw);
        if (price == null) return;
        void (async () => {
          if (tickBusy) return;
          tickBusy = true;
          try {
            await onLtpTick(price, Date.now());
          } finally {
            tickBusy = false;
          }
        })();
      });
      ws.addEventListener('error', (e) => {
        log.warn({ err: String(e) }, 'futures automation native_ws error');
      });
      cleanups.push(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
      log.info({ pair, wsUrl }, 'futures automation: native_ws LTP feed started');
    } catch (e) {
      log.error({ err: e }, 'futures automation native_ws failed to start');
    }
  } else if (transport === 'native_ws' && !wsUrl) {
    log.warn('FUTURES_AUTOMATION_LTP_TRANSPORT=native_ws but FUTURES_AUTOMATION_WSS_URL empty — using rt_poll');
  }

  if (cleanups.length === 0) {
    const id = setInterval(() => {
      void (async () => {
        if (tickBusy) return;
        tickBusy = true;
        try {
          const snap = await fetchFuturesRtSnapshot(pair, { signal: AbortSignal.timeout(8_000) });
          if (!snap) {
            log.warn({ pair }, 'futures automation rt_poll: no snapshot');
            return;
          }
          await onLtpTick(snap.last, Date.now());
        } catch (e) {
          log.warn({ err: e, pair }, 'futures automation rt_poll tick failed');
        } finally {
          tickBusy = false;
        }
      })();
    }, pollMs);
    cleanups.push(() => clearInterval(id));
    log.info({ pair, pollMs, transport: 'rt_poll' }, 'futures automation started (rt_poll, SMC-derived levels)');
  }

  stopFn = () => {
    for (const c of cleanups) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    cleanups.length = 0;
    stopFn = null;
    log.info('futures automation stopped');
  };
}

export function stopFuturesAutomation(): void {
  if (stopFn) stopFn();
}
