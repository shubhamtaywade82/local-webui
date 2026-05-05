import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Activity, TrendingUp } from "lucide-react";

type PulseRow = {
  sym: string;
  price: string;
  change: string;
  trend?: string;
  color?: string;
};

type OhlcvBar = { open: number; high: number; low: number; close: number; volume: number; time: number };

type InstrumentRow = { pair: string; base: string; quote: string; status: string };

type OrderBookSide = Record<string, string>;

type OrderBookPayload = {
  pair: string;
  bids: OrderBookSide;
  asks: OrderBookSide;
  timestamp: number;
};

const DEFAULT_PAIR = "B-BTC_USDT";
const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

function parseDisplayPrice(s: string): number {
  const n = parseFloat(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function sortBookLevels(side: OrderBookSide, kind: "bid" | "ask", max: number) {
  const rows = Object.entries(side)
    .map(([price, qty]) => ({
      price: parseFloat(price),
      qty: parseFloat(String(qty)),
    }))
    .filter((r) => Number.isFinite(r.price) && Number.isFinite(r.qty) && r.qty > 0);
  rows.sort((a, b) => (kind === "bid" ? b.price - a.price : a.price - b.price));
  return rows.slice(0, max);
}

function Sparkline({ closes, accent }: { closes: number[]; accent: string }) {
  const pts = useMemo(() => {
    if (closes.length < 2) return "";
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const pad = 2;
    const w = 100;
    const h = 36;
    const span = max - min || 1;
    return closes
      .map((c, i) => {
        const x = pad + (i / (closes.length - 1)) * (w - pad * 2);
        const y = pad + (1 - (c - min) / span) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [closes]);
  if (!pts) {
    return (
      <div className="h-10 flex items-center text-xs" style={{ color: "var(--text-muted)" }}>
        Not enough bars yet
      </div>
    );
  }
  return (
    <svg viewBox="0 0 100 36" className="w-full h-24" preserveAspectRatio="none">
      <polyline fill="none" stroke={accent} strokeWidth="1.2" points={pts} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function TradingDashboardPage() {
  const [instruments, setInstruments] = useState<InstrumentRow[]>([]);
  const [instQuery, setInstQuery] = useState("");
  const [pair, setPair] = useState(DEFAULT_PAIR);
  const [barInterval, setBarInterval] = useState<string>("1h");
  const [pulse, setPulse] = useState<PulseRow[]>([]);
  const [wsLive, setWsLive] = useState(false);
  const [rtCell, setRtCell] = useState<Record<string, unknown> | null>(null);
  const [book, setBook] = useState<OrderBookPayload | null>(null);
  const [bars, setBars] = useState<OhlcvBar[]>([]);
  const [trades, setTrades] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [instError, setInstError] = useState<string | null>(null);

  const filteredInstruments = useMemo(() => {
    const q = instQuery.trim().toLowerCase();
    if (!q) return instruments.slice(0, 200);
    return instruments.filter((r) => r.pair.toLowerCase().includes(q) || r.base.toLowerCase().includes(q)).slice(0, 200);
  }, [instruments, instQuery]);

  const selectOptions = useMemo(() => {
    const base =
      filteredInstruments.length > 0
        ? filteredInstruments
        : [{ pair: DEFAULT_PAIR, base: "BTC", quote: "USDT", status: "" }];
    if (!base.some((r) => r.pair === pair)) {
      return [{ pair, base: "", quote: "", status: "" }, ...base];
    }
    return base;
  }, [filteredInstruments, pair]);

  const loadInstruments = useCallback(async () => {
    setInstError(null);
    try {
      const res = await fetch("/api/trading/futures/instruments");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { instruments?: InstrumentRow[] };
      setInstruments(Array.isArray(data.instruments) ? data.instruments : []);
    } catch (e) {
      setInstError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadInstruments();
  }, [loadInstruments]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/trading/futures/ohlcv?pair=${encodeURIComponent(pair)}&interval=${encodeURIComponent(barInterval)}&limit=96`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { bars?: OhlcvBar[] };
        if (!cancelled) setBars(Array.isArray(data.bars) ? data.bars : []);
      } catch (e) {
        if (!cancelled) {
          setBars([]);
          setError((e as Error).message);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pair, barInterval]);

  const refreshTickerPanels = useCallback(async () => {
    setError(null);
    try {
      const [rtRes, obRes, trRes] = await Promise.all([
        fetch("/api/trading/futures/rt"),
        fetch(`/api/trading/futures/orderbook?pair=${encodeURIComponent(pair)}&depth=20`),
        fetch(`/api/trading/futures/trades?pair=${encodeURIComponent(pair)}`),
      ]);
      if (rtRes.ok) {
        const rtJson = (await rtRes.json()) as { prices?: Record<string, Record<string, unknown>> };
        const cell = rtJson.prices?.[pair] ?? null;
        setRtCell(cell);
      }
      if (obRes.ok) {
        setBook((await obRes.json()) as OrderBookPayload);
      }
      if (trRes.ok) {
        const tj = (await trRes.json()) as { trades?: unknown[] };
        setTrades(Array.isArray(tj.trades) ? tj.trades : []);
      }
      if (!rtRes.ok && !obRes.ok) {
        setError("Could not refresh market data (upstream or network).");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pair]);

  useEffect(() => {
    void refreshTickerPanels();
    const id = window.setInterval(() => {
      void refreshTickerPanels();
    }, 7_000);
    return () => window.clearInterval(id);
  }, [refreshTickerPanels]);

  useEffect(() => {
    let lastKnown: Record<string, number> = {};
    const loadPulse = async () => {
      try {
        const res = await fetch("/api/market/pulse");
        if (res.ok) {
          const data = (await res.json()) as { pulse?: PulseRow[] };
          const rows = Array.isArray(data.pulse) ? data.pulse : [];
          setPulse(rows);
          rows.forEach((p) => {
            const n = parseDisplayPrice(p.price);
            if (Number.isFinite(n)) lastKnown[p.sym] = n;
          });
        }
      } catch {
        /* ignore */
      }
    };
    void loadPulse();

    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${window.location.host}/api/market/ws`;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof globalThis.setTimeout> | undefined;

    const connect = () => {
      socket?.close();
      const ws = new WebSocket(wsUrl);
      socket = ws;
      ws.onopen = () => {
        setWsLive(true);
      };
      ws.onclose = () => {
        setWsLive(false);
        reconnect = globalThis.setTimeout(connect, 3_000);
      };
      ws.onerror = () => {
        setWsLive(false);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type?: string; data?: unknown };
          if (msg.type === "initial" && Array.isArray(msg.data)) {
            setPulse(msg.data as PulseRow[]);
            (msg.data as PulseRow[]).forEach((p) => {
              const n = parseDisplayPrice(p.price);
              if (Number.isFinite(n)) lastKnown[p.sym] = n;
            });
            return;
          }
          if (msg.type === "update" && msg.data && typeof msg.data === "object") {
            const update = msg.data as PulseRow & { sym?: string };
            const sym = String(update.sym ?? "").toUpperCase();
            if (!["BTC", "ETH", "SOL"].includes(sym)) return;
            const current = parseDisplayPrice(String(update.price ?? ""));
            if (!Number.isFinite(current)) return;
            lastKnown[sym] = current;
            setPulse((prevRows) => {
              const next = [...prevRows];
              const idx = next.findIndex((p) => p.sym === sym);
              if (idx >= 0) next[idx] = { ...next[idx], ...update, sym };
              else next.push({ ...update, sym });
              return next;
            });
          }
        } catch {
          /* ignore */
        }
      };
    };
    connect();
    return () => {
      if (reconnect !== undefined) window.clearTimeout(reconnect);
      socket?.close();
    };
  }, []);

  const closes = useMemo(() => bars.map((b) => b.close).filter((n) => Number.isFinite(n)), [bars]);

  const bestBid = book ? sortBookLevels(book.bids, "bid", 1)[0] : undefined;
  const bestAsk = book ? sortBookLevels(book.asks, "ask", 1)[0] : undefined;

  const spread =
    bestBid && bestAsk && bestAsk.price > bestBid.price ? (bestAsk.price - bestBid.price).toFixed(4) : "—";

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      <header
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="p-1.5 rounded-md hover:bg-white/5 transition-colors flex-shrink-0"
            style={{ color: "var(--text-tertiary)" }}
            title="Back to workspace"
          >
            <ArrowLeft size={18} />
          </Link>
          <TrendingUp size={18} style={{ color: "var(--accent)" }} className="flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              CoinDCX futures dashboard
            </div>
            <div className="text-[10px] truncate flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
              <span className="inline-flex items-center gap-1">
                <Activity size={10} />
                Market WS (BTC/ETH/SOL): {wsLive ? "live" : "offline"}
              </span>
              <span>·</span>
              <a
                href="https://docs.coindcx.com/"
                target="_blank"
                rel="noreferrer"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                API docs
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {error && (
          <div
            className="rounded-lg px-3 py-2 text-xs font-mono break-all"
            style={{
              background: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.35)",
              color: "var(--text-primary)",
            }}
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {pulse.length === 0 ? (
            <div className="col-span-full text-xs" style={{ color: "var(--text-muted)" }}>
              Loading pulse… (server must be running with CoinDCX market stream)
            </div>
          ) : (
            pulse.map((p) => (
              <div
                key={p.sym}
                className="rounded-xl p-4 border"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}
              >
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  {p.sym} perpetual
                </div>
                <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>
                  {p.price}
                </div>
                <div className="text-xs mt-1" style={{ color: p.color ?? "var(--text-secondary)" }}>
                  {p.change} · {p.trend ?? ""}
                </div>
              </div>
            ))
          )}
        </div>

        <div
          className="rounded-xl p-4 border grid grid-cols-1 lg:grid-cols-3 gap-4"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}
        >
          <div className="lg:col-span-1 space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Pair
            </label>
            <input
              type="text"
              value={instQuery}
              onChange={(e) => setInstQuery(e.target.value)}
              placeholder="Filter e.g. ETH, SOL, B-BTC"
              className="w-full rounded-md px-2 py-1.5 text-sm"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="w-full rounded-md px-2 py-2 text-xs font-mono max-h-48"
              size={10}
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              {selectOptions.map((r) => (
                <option key={r.pair} value={r.pair}>
                  {r.pair}
                </option>
              ))}
            </select>
            {instError && (
              <p className="text-[11px]" style={{ color: "var(--error, #f87171)" }}>
                Instruments: {instError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void loadInstruments()}
              className="text-xs px-2 py-1 rounded-md hover:bg-white/5"
              style={{ border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              Reload instruments
            </button>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Chart interval
              </span>
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  type="button"
                  onClick={() => setBarInterval(iv)}
                  className="text-xs px-2 py-0.5 rounded-md"
                  style={{
                    background: barInterval === iv ? "var(--accent-muted)" : "transparent",
                    color: barInterval === iv ? "var(--accent)" : "var(--text-tertiary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {iv}
                </button>
              ))}
            </div>

            <div className="rounded-lg p-3 border" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
              <div className="text-xs font-mono mb-2" style={{ color: "var(--text-secondary)" }}>
                {pair} · close (last {closes.length} bars)
              </div>
              <Sparkline closes={closes} accent="var(--accent)" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(
                [
                  ["Mark", rtCell?.mp ?? rtCell?.mark_price],
                  ["Last", rtCell?.ls ?? rtCell?.last_price],
                  ["24h high", rtCell?.h],
                  ["24h low", rtCell?.l],
                  ["24h change %", rtCell?.pc],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-md p-2 border" style={{ borderColor: "var(--border-subtle)" }}>
                  <div style={{ color: "var(--text-muted)" }}>{k}</div>
                  <div className="font-mono tabular-nums mt-0.5" style={{ color: "var(--text-primary)" }}>
                    {v != null && v !== "" ? String(v as string | number) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            className="rounded-xl border p-4"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}
          >
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Order book (top 12)
            </div>
            <div className="text-[10px] mb-3 font-mono" style={{ color: "var(--text-muted)" }}>
              Best bid {bestBid?.price ?? "—"} · Best ask {bestAsk?.price ?? "—"} · Spread {spread}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
              <div>
                <div className="uppercase tracking-wider mb-1" style={{ color: "var(--success, #4ade80)" }}>
                  Bids
                </div>
                {book
                  ? sortBookLevels(book.bids, "bid", 12).map((r) => (
                      <div key={r.price} className="flex justify-between gap-2 py-0.5">
                        <span style={{ color: "var(--text-primary)" }}>{r.price}</span>
                        <span style={{ color: "var(--text-muted)" }}>{r.qty}</span>
                      </div>
                    ))
                  : "—"}
              </div>
              <div>
                <div className="uppercase tracking-wider mb-1" style={{ color: "var(--error, #f87171)" }}>
                  Asks
                </div>
                {book
                  ? sortBookLevels(book.asks, "ask", 12).map((r) => (
                      <div key={r.price} className="flex justify-between gap-2 py-0.5">
                        <span style={{ color: "var(--text-primary)" }}>{r.price}</span>
                        <span style={{ color: "var(--text-muted)" }}>{r.qty}</span>
                      </div>
                    ))
                  : "—"}
              </div>
            </div>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}
          >
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Recent public trades
            </div>
            <div className="overflow-x-auto text-[11px] font-mono max-h-64 overflow-y-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th className="py-1 pr-2">Time</th>
                    <th className="py-1 pr-2">Side</th>
                    <th className="py-1 pr-2">Price</th>
                    <th className="py-1">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 20).map((t, i) => {
                    const row = t as Record<string, unknown>;
                    const ts = row.timestamp ?? row.T ?? row.time;
                    const side = row.side ?? row.taker_side ?? row.S;
                    const price = row.price ?? row.p;
                    const qty = row.quantity ?? row.q ?? row.amount;
                    return (
                      <tr key={i} style={{ color: "var(--text-secondary)" }}>
                        <td className="py-0.5 pr-2">{String(ts ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(side ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(price ?? "—")}</td>
                        <td className="py-0.5">{String(qty ?? "—")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {trades.length === 0 && <div style={{ color: "var(--text-muted)" }}>No trades in response</div>}
            </div>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed max-w-3xl" style={{ color: "var(--text-muted)" }}>
          Data is <strong>public</strong> CoinDCX REST (
          <code className="text-[10px]">public.coindcx.com</code>, <code className="text-[10px]">api.coindcx.com</code>)
          proxied by this app&apos;s <code className="text-[10px]">/trading/*</code> routes. Live BTC/ETH/SOL tiles use the
          same <code className="text-[10px]">/market/ws</code> feed as Research (Socket.IO to CoinDCX on the server). Authenticated
          orders and balances are not shown here — use API keys with the existing <code className="text-[10px]">coindcx_futures</code>{" "}
          tool in chat or extend this page if you need account views.
        </p>
      </div>
    </div>
  );
}
