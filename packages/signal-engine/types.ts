export type Direction = 'long' | 'short';
export type EntryType = 'market' | 'limit';

export interface TradeSignal {
  pair: string;
  direction: Direction;
  entryType: EntryType;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number; // 0-1
  reasons: string[];
  timeframes: {
    regime: string;
    structure: string;
    trigger: string;
    validation: string;
  };
  generatedAt: number; // epoch ms
}

export interface SmcContext {
  structureBias: number;
  longScore: number;
  shortScore: number;
  inBullOb: boolean;
  inBearOb: boolean;
  bullObLo: number | null;
  bullObHi: number | null;
  bearObLo: number | null;
  bearObHi: number | null;
  recentBullSweep: boolean;
  recentBearSweep: boolean;
  atr14: number | null;
}

export interface SignalDbAdapter {
  saveTradeSignal(signal: {
    pair: string;
    direction: string;
    entryType: string;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    reasons: string[];
    timeframes: Record<string, unknown>;
    status?: string;
  }): Promise<string>;
}
