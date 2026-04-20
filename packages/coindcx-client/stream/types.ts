/**
 * CoinDCX stream uses Socket.IO at `wss://stream.coindcx.com` with `join` / `leave`
 * payloads shaped as `{ channelName: string, ...auth }` (not subscribe/channelList).
 * @see apps/server/src/services/marketStream.ts (working integration)
 */

export type StreamMarketKind = 'spot' | 'futures';

/** Pulse / market-data channels used by the web UI today. */
export const PULSE_PUBLIC_CHANNELS = [
  'B-BTC_USDT@prices-futures',
  'B-ETH_USDT@prices-futures',
  'B-SOL_USDT@prices-futures',
  'currentPrices@futures@rt',
] as const;

export interface CoinDCXStreamEngineConfig {
  endpoint?: string;
  transports?: ('websocket' | 'polling')[];
  /** Milliseconds before `connect()` rejects (Engine.IO / handshake). */
  timeout?: number;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
  /**
   * Emit both `{ channelName }` and `['join', { channelName }]` (legacy CoinDCX stream).
   * Skip for private joins (auth); those use a single emit.
   */
  dualLegacyJoinDefault?: boolean;
}

export interface StreamSubscription {
  channelName: string;
  /** When true, emit array-wrapped join after object join (unless auth is set). */
  dualLegacyJoin: boolean;
  /** Merged into `join` payload with `channelName` (e.g. authSignature, apiKey). */
  authFields?: Record<string, string>;
}
