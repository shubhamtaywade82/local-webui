import { io, Socket } from "socket.io-client";
import { EventEmitter } from "events";

export interface PriceUpdate {
  sym: string;
  price: string;
  change: string;
  trend: "Bullish" | "Neutral" | "Bearish" | "Strong Bull";
  color: string;
}

class MarketStream extends EventEmitter {
  private socket: Socket | null = null;
  private latestPrices: Record<string, PriceUpdate> = {};
  private targets = ['B-BTC_USDT', 'B-ETH_USDT', 'B-SOL_USDT'];

  constructor() {
    super();
  }

  start() {
    if (this.socket) return;

    this.socket = io("https://stream.coindcx.com", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log("Connected to CoinDCX Market Stream");
      this.targets.forEach(channel => {
        this.socket?.emit("join", { channelName: `${channel}@prices-futures` });
      });
    });

    this.socket.on("price-change", (data: any) => {
      // Data format: { T: timestamp, p: price, pr: product }
      // We need to match it back to our sym
      // Since the socket.io event doesn't explicitly send the symbol name in the message payload (usually),
      // verify if we can match it. CoinDCX prices-futures events usually come on specific channel emitters or tagged.
      // Based on research, we might need to handle the specific channel event if provided.
    });

    // Special handling for LTP events which usually include the symbol
    this.socket.on("price-change", (data: any) => {
      if (!data) return;
      
      // Map B-BTC_USDT@prices-futures -> BTC
      const sym = data.channel?.split('@')[0]?.replace('B-', '').replace('_USDT', '') || 'BTC';
      const price = parseFloat(data.p).toLocaleString(undefined, { minimumFractionDigits: 1 });
      
      const update: PriceUpdate = {
        sym,
        price,
        change: '0%', // WS might not send daily change, we might need a REST hybrid or keep track
        trend: 'Neutral',
        color: 'var(--text-primary)'
      };

      this.latestPrices[sym] = update;
      this.emit("update", update);
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from CoinDCX Market Stream");
    });

    this.socket.on("error", (err) => {
      console.error("Market Stream Error:", err);
    });
  }

  getLatest() {
    return Object.values(this.latestPrices);
  }

  stop() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const marketStream = new MarketStream();
