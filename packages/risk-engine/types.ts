export interface AccountState {
  availableMargin: number;    // USDT available
  totalEquity: number;
  openPositionCount: number;
  currentDrawdownPct: number; // 0-100
  openPositions: Array<{
    pair: string;
    side: string;
    quantity: number;
    leverage: number;
  }>;
}

export interface RiskDecision {
  allowed: boolean;
  reason?: string;
  adjustedQuantity?: number;
  adjustedLeverage?: number;
}

export interface RiskConfig {
  maxLossPerTradePct: number;   // % of equity per trade (default 1)
  maxDrawdownPct: number;       // portfolio drawdown limit (default 5)
  maxOpenPositions: number;     // default 5
  maxLeverage: number;          // hard cap (default 20)
  maxCorrelationExposure: number; // max same-direction positions (default 3)
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxLossPerTradePct:      1,
  maxDrawdownPct:          5,
  maxOpenPositions:        5,
  maxLeverage:             20,
  maxCorrelationExposure:  3,
};
