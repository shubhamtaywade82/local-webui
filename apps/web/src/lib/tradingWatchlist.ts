/** Browser-persisted futures pairs to monitor (CoinDCX form `B-BASE_USDT`). */
export const WATCHLIST_STORAGE_KEY = "ai-workspace-trading-watchlist-v1";

export const DEFAULT_WATCHLIST_PAIRS = ["B-BTC_USDT", "B-ETH_USDT", "B-SOL_USDT"] as const;

export function isFuturesPairFormat(s: string): boolean {
  return /^B-[A-Z0-9]+_USDT$/i.test(s.trim());
}

/** Normalize to `B-ABC_USDT` uppercase token. */
export function normalizeFuturesPair(s: string): string {
  const t = s.trim().toUpperCase();
  if (!/^B-[A-Z0-9]+_USDT$/.test(t)) return "";
  return t;
}

export function loadWatchlistPairs(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [...DEFAULT_WATCHLIST_PAIRS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_WATCHLIST_PAIRS];
    const pairs = [...new Set(parsed.map((x) => normalizeFuturesPair(String(x))).filter(Boolean))];
    return pairs.length > 0 ? pairs : [...DEFAULT_WATCHLIST_PAIRS];
  } catch {
    return [...DEFAULT_WATCHLIST_PAIRS];
  }
}

export function saveWatchlistPairs(pairs: string[]): void {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(pairs));
  } catch {
    /* quota / private mode */
  }
}
