/**
 * Live checks against CoinDCX public Socket.IO (`wss://stream.coindcx.com`).
 * Invariants cross-checked with `docs/CoindcxWebsocketIntegration.md`:
 * - Socket.IO client v2 (`socket.io-client-v2` alias)
 * - `join` / `leave` with `{ channelName }`
 * - Futures channel names: `{pair}@prices-futures`, `currentPrices@futures@rt`
 *
 * Run (requires outbound network):
 *   COINDCX_LIVE_E2E=1 pnpm --filter @workspace/coindcx-client exec vitest run stream/coindcx-live.e2e.test.ts
 */
import { describe, expect, it } from 'vitest';
import { CoinDCXStreamEngine } from './engine';
import {
  futuresCurrentPricesRtChannel,
  futuresLtpChannel,
} from './channels';

const LIVE = process.env.COINDCX_LIVE_E2E === '1';

const PRICE_EVENTS = [
  'price-change',
  'prices',
  'currentPrices@futures#update',
] as const;

function waitForFirstPriceEvent(
  engine: CoinDCXStreamEngine,
  ms: number,
): Promise<{ name: (typeof PRICE_EVENTS)[number]; data: unknown }> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      cleanup();
      reject(new Error(`No CoinDCX public price event within ${ms}ms`));
    }, ms);

    const handlers: Partial<
      Record<(typeof PRICE_EVENTS)[number], (data: unknown) => void>
    > = {};

    const cleanup = () => {
      clearTimeout(to);
      for (const ev of PRICE_EVENTS) {
        const h = handlers[ev];
        if (h) engine.off(ev, h);
      }
    };

    for (const ev of PRICE_EVENTS) {
      const h = (data: unknown) => {
        cleanup();
        resolve({ name: ev, data });
      };
      handlers[ev] = h;
      engine.on(ev, h);
    }
  });
}

describe('CoinDCX REST parity (no Socket.IO)', () => {
  it('HTTP futures RT exposes B-BTC_USDT (same source as Market Pulse fallback)', async () => {
    const res = await fetch(
      'https://public.coindcx.com/market_data/v3/current_prices/futures/rt',
      { signal: AbortSignal.timeout(15_000) },
    );
    expect(res.ok).toBe(true);
    const json = (await res.json()) as { prices?: Record<string, unknown> };
    expect(json.prices).toBeDefined();
    expect(json.prices?.['B-BTC_USDT']).toBeDefined();
  });
});

describe.skipIf(!LIVE)('CoinDCX live WebSocket (docs/CoindcxWebsocketIntegration.md)', () => {
  it('handshakes and receives data on B-BTC_USDT@prices-futures', async () => {
    const engine = new CoinDCXStreamEngine({
      dualLegacyJoinDefault: false,
      timeout: 25_000,
      transports: ['websocket'],
      reconnection: false,
    });
    engine.subscribe(futuresLtpChannel('B-BTC_USDT'));
    await engine.connect();
    expect(engine.isConnected()).toBe(true);

    const { name, data } = await waitForFirstPriceEvent(engine, 60_000);
    expect(PRICE_EVENTS).toContain(name);
    expect(data).toBeDefined();

    engine.disconnect();
    expect(engine.isConnected()).toBe(false);
  });

  it('handshakes and receives currentPrices@futures@rt bulk channel', async () => {
    const engine = new CoinDCXStreamEngine({
      dualLegacyJoinDefault: false,
      timeout: 25_000,
      transports: ['websocket'],
      reconnection: false,
    });
    engine.subscribe(futuresCurrentPricesRtChannel());
    await engine.connect();

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => {
        engine.off('currentPrices@futures#update', onUpd);
        reject(new Error('No currentPrices@futures#update within 60s'));
      }, 60_000);
      const onUpd = (payload: unknown) => {
        clearTimeout(to);
        engine.off('currentPrices@futures#update', onUpd);
        expect(payload).toBeDefined();
        resolve();
      };
      engine.on('currentPrices@futures#update', onUpd);
    });

    engine.disconnect();
  });
});
