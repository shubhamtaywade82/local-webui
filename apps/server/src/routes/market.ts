import { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { marketStream } from "../services/marketStream";

export default async function routes(app: FastifyInstance) {
  // Existing REST endpoint for initial load
  app.get("/pulse", async () => {
    try {
      // Return latest prices from stream if available, else fetch fresh
      const latest = marketStream.getLatest();
      if (latest.length > 0) return { pulse: latest };

      const tickerRes = await fetch('https://api.coindcx.com/exchange/ticker');
      const tickers: any[] = await tickerRes.json();
      const targets = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      
      const results = tickers
        .filter((t) => targets.includes(t.market))
        .map((t) => {
          const sym = t.market.replace('USDT', '');
          const lastNum = parseFloat(String(t.last_price));
          const chg = parseFloat(String(t.change_24_hour));
          const price = Number.isFinite(lastNum)
            ? lastNum.toLocaleString(undefined, { minimumFractionDigits: sym === 'BTC' ? 1 : 2 })
            : '--';
          const hasChg = Number.isFinite(chg);
          return {
            sym,
            price,
            change: hasChg ? `${chg > 0 ? '+' : ''}${chg.toFixed(1)}%` : '0%',
            trend: hasChg
              ? chg > 2
                ? 'Strong Bull'
                : chg > 0
                  ? 'Bullish'
                  : chg > -2
                    ? 'Neutral'
                    : 'Bearish'
              : 'Neutral',
            color: hasChg
              ? chg > 0
                ? 'var(--success)'
                : chg < -2
                  ? 'var(--error)'
                  : 'var(--warning)'
              : 'var(--text-muted)',
          };
        });

      return { pulse: results };
    } catch {
      return { pulse: [] };
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
      const latest = marketStream.getLatest();
      if (latest.length > 0) {
        sendJson({ type: "initial", data: latest });
      }
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
