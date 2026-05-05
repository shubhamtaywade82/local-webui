import type { FastifyInstance } from "fastify";
import {
  CoinDCXRestClient,
  createAuthClientFromEnv,
  isCoinDcxFuturesPair,
} from "@workspace/coindcx-client";
import { SmcAnalysisTool } from "@workspace/tools";

const PUBLIC_FUTURES_RT = "https://public.coindcx.com/market_data/v3/current_prices/futures/rt";
const rest = new CoinDCXRestClient();

function parseFuturesPair(q: unknown): string | null {
  const s = String(q ?? "").trim();
  return isCoinDcxFuturesPair(s) ? s : null;
}

function parseDepth(q: unknown): 10 | 20 | 50 {
  const n = parseInt(String(q ?? "20"), 10);
  if (n === 10 || n === 20 || n === 50) return n;
  return 20;
}

function parseLimit(q: unknown, fallback: number, cap: number): number {
  const n = parseInt(String(q ?? String(fallback)), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(cap, Math.max(1, n));
}

export default async function tradingRoutes(app: FastifyInstance) {
  /** Full futures RT snapshot (same payload as CoinDCX public). */
  app.get("/futures/rt", async (_req, reply) => {
    try {
      const res = await fetch(PUBLIC_FUTURES_RT, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) {
        return reply.code(502).send({ error: "upstream_rt", status: res.status });
      }
      return reply.send(await res.json());
    } catch (err) {
      return reply.code(502).send({ error: "rt_fetch_failed", message: (err as Error).message });
    }
  });

  /** Active USDT-margined futures instruments (public). */
  app.get("/futures/instruments", async (_req, reply) => {
    try {
      const active = await rest.fetchActiveInstruments("USDT");
      const instruments = active
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .map((a) => {
          const pair = String(a.pair ?? a.symbol ?? "");
          return {
            pair,
            base: String(a.base_currency_short_name ?? ""),
            quote: String(a.quote_currency_short_name ?? "USDT"),
            status: String(a.status ?? ""),
          };
        })
        .filter((r) => isCoinDcxFuturesPair(r.pair));
      return { instruments };
    } catch (err) {
      return reply.code(502).send({ error: "instruments_failed", message: (err as Error).message });
    }
  });

  /** Order book (v3 …/orderbook/{pair}-futures/{depth}). */
  app.get("/futures/orderbook", async (req, reply) => {
    const q = req.query as { pair?: string; depth?: string };
    const pair = parseFuturesPair(q.pair);
    if (!pair) {
      return reply.code(400).send({ error: "invalid_pair", hint: "Use CoinDCX form e.g. B-BTC_USDT" });
    }
    const depth = parseDepth(q.depth);
    try {
      const ob = await rest.fetchOrderBook(pair, depth);
      return ob;
    } catch (err) {
      return reply.code(502).send({ error: "orderbook_failed", message: (err as Error).message });
    }
  });

  /** OHLCV bars for charting (public). */
  app.get("/futures/ohlcv", async (req, reply) => {
    const q = req.query as { pair?: string; interval?: string; limit?: string };
    const pair = parseFuturesPair(q.pair);
    if (!pair) {
      return reply.code(400).send({ error: "invalid_pair", hint: "Use CoinDCX form e.g. B-BTC_USDT" });
    }
    const interval = String(q.interval ?? "1h").trim() || "1h";
    const limit = parseLimit(q.limit, 72, 500);
    try {
      const bars = await rest.fetchOhlcv(pair, interval, limit);
      return { pair, interval, limit, bars };
    } catch (err) {
      return reply.code(502).send({ error: "ohlcv_failed", message: (err as Error).message });
    }
  });

  /** Last closed bar for 1m / 15m / 1h (public) — MTF strip like the bot TUI. */
  app.get("/futures/mtf-last", async (req, reply) => {
    const q = req.query as { pair?: string };
    const pair = parseFuturesPair(q.pair);
    if (!pair) {
      return reply.code(400).send({ error: "invalid_pair", hint: "Use CoinDCX form e.g. B-ETH_USDT" });
    }
    const frames = ["1m", "15m", "1h"] as const;
    try {
      const rows = await Promise.all(
        frames.map(async (tf) => {
          const bars = await rest.fetchOhlcv(pair, tf, 4);
          const last = bars.at(-1);
          return {
            tf,
            close: last?.close ?? null,
            volume: last?.volume ?? null,
            time: last?.time ?? null,
          };
        })
      );
      return { pair, rows };
    } catch (err) {
      return reply.code(502).send({ error: "mtf_failed", message: (err as Error).message });
    }
  });

  /** Recent public futures trades. */
  app.get("/futures/trades", async (req, reply) => {
    const q = req.query as { pair?: string };
    const pair = parseFuturesPair(q.pair);
    if (!pair) {
      return reply.code(400).send({ error: "invalid_pair", hint: "Use CoinDCX form e.g. B-BTC_USDT" });
    }
    try {
      const trades = await rest.fetchPublicTrades(pair);
      return { pair, trades };
    } catch (err) {
      return reply.code(502).send({ error: "trades_failed", message: (err as Error).message });
    }
  });

  /**
   * Authenticated snapshot: futures positions + open orders (same keys as TUI bot).
   * Requires `COINDCX_API_KEY` + `COINDCX_API_SECRET` on the server.
   */
  app.get("/account/snapshot", async (_req, reply) => {
    const auth = createAuthClientFromEnv();
    if (!auth) {
      return reply.send({
        configured: false,
        positions: [],
        openOrders: [],
        message:
          "Set COINDCX_API_KEY and COINDCX_API_SECRET in apps/server/.env to show positions, PnL, and open orders.",
      });
    }
    try {
      const positions = await auth.getPositions();
      let openOrdersRaw: unknown[] = [];
      try {
        openOrdersRaw = await auth.listOrders(undefined, "open");
      } catch {
        const all = await auth.listOrders();
        const openish = new Set([
          "open",
          "pending",
          "pending_initiated",
          "partly_filled",
          "partially_filled",
          "trigger_pending",
        ]);
        openOrdersRaw = all.filter((o) => {
          const st = String((o as { status?: string }).status ?? "").toLowerCase();
          return openish.has(st);
        });
      }
      const activePositions = positions.filter((p) => Math.abs(Number(p.quantity) || 0) > 1e-12);
      const unrealizedTotal = activePositions.reduce(
        (s, p) => s + (Number.isFinite(Number(p.unrealised_pnl)) ? Number(p.unrealised_pnl) : 0),
        0
      );
      const openOrders = (openOrdersRaw as unknown[]).filter((o) => o && typeof o === "object");
      return {
        configured: true,
        positions: activePositions,
        openOrders,
        unrealizedPnlUsdApprox: unrealizedTotal,
      };
    } catch (err) {
      return reply.code(502).send({
        configured: true,
        error: (err as Error).message,
        positions: [],
        openOrders: [],
      });
    }
  });

  /**
   * SMC / AI strategy pulse text for the focused pair (uses `@workspace/tools` SmcAnalysisTool — public OHLCV only).
   * Query: `pair=B-ETH_USDT`, optional `mode=setup` (default) or `mode=full` for full_analysis.
   */
  app.get("/ai/smc", async (req, reply) => {
    const q = req.query as { pair?: string; mode?: string };
    const pair = parseFuturesPair(q.pair);
    if (!pair) {
      return reply.code(400).send({ error: "invalid_pair", hint: "Use e.g. B-ETH_USDT" });
    }
    const mode = String(q.mode ?? "setup").toLowerCase();
    const action = mode === "full" ? "full_analysis" : "setup";
    const tool = new SmcAnalysisTool();
    try {
      const text = await tool.execute({ action, symbol: pair });
      return { pair, action, text };
    } catch (err) {
      return reply.code(500).send({ error: "smc_failed", message: (err as Error).message });
    }
  });
}
