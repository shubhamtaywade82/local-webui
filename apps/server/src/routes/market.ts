import { FastifyInstance } from "fastify";

export default async function routes(app: FastifyInstance) {
  app.get("/pulse", async () => {
    try {
      const tickerRes = await fetch('https://api.coindcx.com/exchange/ticker', {
        signal: AbortSignal.timeout(5_000),
      });
      if (!tickerRes.ok) throw new Error("Failed to fetch CoinDCX ticker");
      
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

      return {
        timestamp: new Date().toISOString(),
        pulse: results
      };
    } catch (err) {
      return {
        error: "Pulse data unavailable",
        pulse: [
          { sym: 'BTC', price: '--', change: '0%', trend: 'Unknown', color: 'var(--text-muted)' },
          { sym: 'ETH', price: '--', change: '0%', trend: 'Unknown', color: 'var(--text-muted)' },
          { sym: 'SOL', price: '--', change: '0%', trend: 'Unknown', color: 'var(--text-muted)' },
        ]
      };
    }
  });
}
