import { FastifyInstance } from "fastify";
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
        .filter(t => targets.includes(t.market))
        .map(t => ({
          sym: t.market.replace('USDT', ''),
          price: parseFloat(t.last_price).toLocaleString(undefined, { minimumFractionDigits: 1 }),
          change: (t.change_24_hour > 0 ? '+' : '') + parseFloat(t.change_24_hour).toFixed(1) + '%',
          trend: t.change_24_hour > 2 ? 'Strong Bull' : t.change_24_hour > 0 ? 'Bullish' : t.change_24_hour > -2 ? 'Neutral' : 'Bearish',
          color: t.change_24_hour > 0 ? 'var(--success)' : t.change_24_hour < -2 ? 'var(--error)' : 'var(--warning)'
        }));

      return { pulse: results };
    } catch {
      return { pulse: [] };
    }
  });

  // New WebSocket Relay
  app.get("/ws", { websocket: true }, (connection, req) => {
    const onUpdate = (update: any) => {
      connection.socket.send(JSON.stringify({ type: "update", data: update }));
    };

    marketStream.on("update", onUpdate);

    connection.socket.on("close", () => {
      marketStream.off("update", onUpdate);
    });
  });
}
