import { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { marketStream, type PriceUpdate } from "../services/marketStream";

/** Pulse tiles always show these bases, in order (matches `marketStream` subscriptions). */
const PULSE_ORDER = ["BTC", "ETH", "SOL"] as const;

function pulseRowFromSpotTicker(t: {
  market: string;
  last_price?: unknown;
  change_24_hour?: unknown;
}): PriceUpdate {
  const sym = t.market.replace("USDT", "");
  const lastNum = parseFloat(String(t.last_price));
  const chg = parseFloat(String(t.change_24_hour));
  const price = Number.isFinite(lastNum)
    ? lastNum.toLocaleString(undefined, { minimumFractionDigits: sym === "BTC" ? 1 : 2 })
    : "--";
  const hasChg = Number.isFinite(chg);
  return {
    sym,
    price,
    change: hasChg ? `${chg > 0 ? "+" : ""}${chg.toFixed(1)}%` : "0%",
    trend: hasChg
      ? chg > 2
        ? "Strong Bull"
        : chg > 0
          ? "Bullish"
          : chg > -2
            ? "Neutral"
            : "Bearish"
      : "Neutral",
    color: hasChg
      ? chg > 0
        ? "var(--success)"
        : chg < -2
          ? "var(--error)"
          : "var(--warning)"
      : "var(--text-muted)",
  };
}

function placeholderPulse(sym: string): PriceUpdate {
  return {
    sym,
    price: "—",
    change: "—",
    trend: "Neutral",
    color: "var(--text-muted)",
  };
}

/**
 * Merge stream cache with spot tickers so BTC/ETH/SOL are always present.
 * Without this, `getLatest()` can briefly (or stuck) contain only symbols that already received ticks.
 */
async function resolvePulse(): Promise<PriceUpdate[]> {
  const latest = marketStream.getLatest();
  const map = new Map<string, PriceUpdate>();
  for (const row of latest) {
    const sym = String(row.sym ?? "").toUpperCase();
    if (!sym) continue;
    map.set(sym, { ...row, sym });
  }

  const missing = PULSE_ORDER.filter((s) => !map.has(s));
  if (missing.length > 0) {
    try {
      const tickerRes = await fetch("https://api.coindcx.com/exchange/ticker", {
        signal: AbortSignal.timeout(12_000),
      });
      const tickers: unknown[] = await tickerRes.json();
      const targets = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
      if (Array.isArray(tickers)) {
        for (const raw of tickers) {
          if (!raw || typeof raw !== "object") continue;
          const t = raw as { market?: string };
          if (!t.market || !targets.has(t.market)) continue;
          const sym = t.market.replace("USDT", "");
          if (map.has(sym)) continue;
          map.set(sym, pulseRowFromSpotTicker(t as { market: string; last_price?: unknown; change_24_hour?: unknown }));
        }
      }
    } catch {
      /* keep partial map + placeholders */
    }
  }

  return PULSE_ORDER.map((s) => map.get(s) ?? placeholderPulse(s));
}

export default async function routes(app: FastifyInstance) {
  app.get("/pulse", async () => {
    try {
      const pulse = await resolvePulse();
      return { pulse };
    } catch {
      return { pulse: PULSE_ORDER.map((s) => placeholderPulse(s)) };
    }
  });

  /** Browser Market Pulse: same-origin via Vite `/api` → `/market/ws` (see `vite.config.ts` rewrite). */
  app.get("/ws", { websocket: true }, (connection) => {
    const sendJson = (payload: object) => {
      const sock = connection.socket;
      if (sock.readyState !== WebSocket.OPEN) return;
      sock.send(JSON.stringify(payload));
    };

    const pushInitial = () => {
      void resolvePulse().then((pulse) => {
        sendJson({ type: "initial", data: pulse });
      });
    };
    queueMicrotask(pushInitial);

    const onUpdate = (update: unknown) => {
      sendJson({ type: "update", data: update });
    };
    marketStream.on("update", onUpdate);
    connection.socket.on("close", () => {
      marketStream.off("update", onUpdate);
    });
  });
}
