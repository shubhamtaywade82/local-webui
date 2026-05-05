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

type AccountSnapshot = {
  configured: boolean;
  positions?: Record<string, unknown>[];
  openOrders?: unknown[];
  unrealizedPnlUsdApprox?: number;
  message?: string;
  error?: string;
};

type MtfRow = { tf: string; close: number | null; volume: number | null; time: number | null };

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

function OrderBookDepth({ book, levels }: { book: OrderBookPayload; levels: number }) {
  const bids = sortBookLevels(book.bids, "bid", levels);
  const asks = [...sortBookLevels(book.asks, "ask", levels)].reverse();
  const maxQ = Math.max(1e-12, ...bids.map((b) => b.qty), ...asks.map((a) => a.qty));
  const row = (r: { price: number; qty: number }, kind: "ask" | "bid") => (
    <div key={`${kind}-${r.price}`} className="grid grid-cols-[minmax(0,1fr)_auto_3.5rem] gap-1 items-center leading-tight">
      <span className={kind === "ask" ? "text-rose-300/95" : "text-emerald-300/95"}>{r.price}</span>
      <span className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
        {r.qty < 1 ? r.qty.toFixed(4) : r.qty.toFixed(3)}
      </span>
      <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className={kind === "ask" ? "h-full rounded-sm bg-rose-500/55" : "h-full rounded-sm bg-emerald-500/55"}
          style={{ width: `${Math.min(100, (r.qty / maxQ) * 100)}%` }}
        />
      </div>
    </div>
  );
  return (
    <div className="space-y-1 font-mono text-[10px]">
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto_3.5rem] gap-1 uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        <span>Price</span>
        <span className="text-right">Amt</span>
        <span>Depth</span>
      </div>
      <div className="space-y-0.5 max-h-40 overflow-y-auto">{asks.map((r) => row(r, "ask"))}</div>
      <div className="border-t border-b py-1 text-center text-[11px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
        mid / spread
      </div>
      <div className="space-y-0.5 max-h-40 overflow-y-auto">{bids.map((r) => row(r, "bid"))}</div>
    </div>
  );
}

export default function TradingDashboardPage() {
  const [instruments, setInstruments] = useState<InstrumentRow[]>([]);
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
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [smcText, setSmcText] = useState<string>("");
  const [smcBusy, setSmcBusy] = useState(false);
  const [smcErr, setSmcErr] = useState<string | null>(null);
  const [mtfRows, setMtfRows] = useState<MtfRow[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);

  /** Sorted list for a normal `<select>` dropdown (cap length for browser performance). */
  const pairSelectOptions = useMemo(() => {
    const sorted = [...instruments].sort((a, b) => a.pair.localeCompare(b.pair)).slice(0, 1200);
    const base =
      sorted.length > 0 ? sorted : [{ pair: DEFAULT_PAIR, base: "BTC", quote: "USDT", status: "" }];
    if (!base.some((r) => r.pair === pair)) {
      return [{ pair, base: "", quote: "", status: "" }, ...base];
    }
    return base;
  }, [instruments, pair]);

  const pushLog = useCallback((line: string) => {
    setLogLines((prev) => {
      const t = new Date().toLocaleTimeString();
      const next = [`${t} ${line}`, ...prev].slice(0, 40);
      return next;
    });
  }, []);

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

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/trading/account/snapshot");
      const data = (await res.json()) as AccountSnapshot;
      setAccount(data);
    } catch {
      setAccount({ configured: false, message: "Account snapshot request failed" });
    }
  }, []);

  useEffect(() => {
    void loadAccount();
    const id = globalThis.setInterval(() => void loadAccount(), 12_000);
    return () => globalThis.clearInterval(id);
  }, [loadAccount]);

  const loadSmcAndMtf = useCallback(async () => {
    setSmcErr(null);
    setSmcBusy(true);
    pushLog(`SMC + MTF refresh for ${pair}`);
    try {
      const [smcRes, mtfRes] = await Promise.all([
        fetch(`/api/trading/ai/smc?pair=${encodeURIComponent(pair)}&mode=setup`),
        fetch(`/api/trading/futures/mtf-last?pair=${encodeURIComponent(pair)}`),
      ]);
      if (smcRes.ok) {
        const j = (await smcRes.json()) as { text?: string };
        setSmcText(typeof j.text === "string" ? j.text : "");
      } else {
        setSmcErr(await smcRes.text());
        setSmcText("");
      }
      if (mtfRes.ok) {
        const m = (await mtfRes.json()) as { rows?: MtfRow[] };
        setMtfRows(Array.isArray(m.rows) ? m.rows : []);
      } else {
        setMtfRows([]);
      }
    } catch (e) {
      setSmcErr((e as Error).message);
    } finally {
      setSmcBusy(false);
    }
  }, [pair, pushLog]);

  useEffect(() => {
    void loadSmcAndMtf();
  }, [loadSmcAndMtf]);

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
    const id = globalThis.setInterval(() => {
      void refreshTickerPanels();
    }, 7_000);
    return () => globalThis.clearInterval(id);
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
      if (reconnect !== undefined) globalThis.clearTimeout(reconnect);
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
          className="rounded-lg border px-3 py-2 font-mono text-[10px] flex flex-wrap gap-x-4 gap-y-1"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
        >
          <span>
            <span style={{ color: "var(--text-muted)" }}>FOCUS</span> {pair}
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>WS</span> {wsLive ? "OK" : "—"}
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>API</span>{" "}
            {account?.configured ? "keys" : "public-only"}
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>POS</span> {account?.positions?.length ?? "—"}
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>ORD</span> {account?.openOrders?.length ?? "—"}
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>UR PnL</span>{" "}
            {account?.configured && account.unrealizedPnlUsdApprox != null
              ? `${account.unrealizedPnlUsdApprox >= 0 ? "+" : ""}${account.unrealizedPnlUsdApprox.toFixed(2)} USDT`
              : "—"}
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }} htmlFor="trading-pair-select">
              Trading pair
            </label>
            <select
              id="trading-pair-select"
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="w-full rounded-md px-2 py-2 text-sm font-mono"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              {pairSelectOptions.map((r) => (
                <option key={r.pair} value={r.pair}>
                  {r.pair}
                </option>
              ))}
            </select>
            <p className="text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>
              Open the menu to choose a contract (list is sorted A–Z, first 1200 USDT pairs).
            </p>
            {instError && (
              <p className="text-[11px]" style={{ color: "var(--error, #f87171)" }}>
                {instError}
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
            <div className="flex flex-wrap gap-1 pt-2">
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  type="button"
                  onClick={() => setBarInterval(iv)}
                  className="text-[10px] px-1.5 py-0.5 rounded"
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
            <div className="rounded-lg p-2 border" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
              <div className="text-[10px] font-mono mb-1" style={{ color: "var(--text-muted)" }}>
                Chart · {closes.length} bars
              </div>
              <Sparkline closes={closes} accent="var(--accent)" />
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {(
                [
                  ["Mark", rtCell?.mp ?? rtCell?.mark_price],
                  ["Last", rtCell?.ls ?? rtCell?.last_price],
                  ["24h H", rtCell?.h],
                  ["24h L", rtCell?.l],
                  ["24h %", rtCell?.pc],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded border px-1.5 py-1" style={{ borderColor: "var(--border-subtle)" }}>
                  <div style={{ color: "var(--text-muted)" }}>{k}</div>
                  <div className="font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {v != null && v !== "" ? String(v as string | number) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              BOOK · {pair}
            </div>
            <div className="text-[10px] mb-2 font-mono" style={{ color: "var(--text-muted)" }}>
              bid {bestBid?.price ?? "—"} · ask {bestAsk?.price ?? "—"} · spr {spread}
            </div>
            {book ? <OrderBookDepth book={book} levels={10} /> : <div style={{ color: "var(--text-muted)" }}>Loading book…</div>}
          </div>

          <div className="rounded-xl border p-4 flex flex-col min-h-[280px]" style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                AI strategy pulse (SMC)
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  type="button"
                  disabled={smcBusy}
                  onClick={() => void loadSmcAndMtf()}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-40"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--accent)" }}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  disabled={smcBusy}
                  onClick={async () => {
                    setSmcBusy(true);
                    setSmcErr(null);
                    try {
                      const res = await fetch(`/api/trading/ai/smc?pair=${encodeURIComponent(pair)}&mode=full`);
                      const j = (await res.json()) as { text?: string; error?: string };
                      if (!res.ok) throw new Error(j.error ?? await res.text());
                      setSmcText(typeof j.text === "string" ? j.text : "");
                      pushLog("SMC full_analysis loaded");
                    } catch (e) {
                      setSmcErr((e as Error).message);
                    } finally {
                      setSmcBusy(false);
                    }
                  }}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-40"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                >
                  Full
                </button>
              </div>
            </div>
            {mtfRows.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-2 text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>
                {mtfRows.map((r) => (
                  <span key={r.tf}>
                    <span style={{ color: "var(--text-muted)" }}>{r.tf}</span>{" "}
                    {r.close != null ? r.close.toFixed(r.close > 100 ? 2 : 4) : "—"}
                    {r.volume != null ? (
                      <span style={{ color: "var(--text-muted)" }}> · vol {r.volume < 1e4 ? r.volume.toFixed(0) : `${(r.volume / 1e3).toFixed(1)}K`}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            )}
            {smcErr && <div className="text-[10px] text-rose-400 mb-2 break-all">{smcErr}</div>}
            <pre
              className="flex-1 overflow-auto text-[10px] leading-snug font-mono whitespace-pre-wrap rounded p-2 min-h-[160px]"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              {smcBusy ? "Running SMC…" : smcText || "No SMC output yet."}
            </pre>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4" style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}>
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Positions (futures)
            </div>
            {!account?.configured && (
              <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                {account?.message ?? "Loading…"}
              </p>
            )}
            {account?.configured && account.error && (
              <p className="text-xs text-rose-400 mb-2">{account.error}</p>
            )}
            {account?.configured && !account.error && (account.positions?.length ?? 0) === 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                No open positions.
              </p>
            )}
            {account?.configured && (account.positions?.length ?? 0) > 0 && (
              <div className="overflow-x-auto text-[10px] font-mono">
                <table className="w-full text-left">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="pr-2 py-1">Pair</th>
                      <th className="pr-2 py-1">Side</th>
                      <th className="pr-2 py-1">Qty</th>
                      <th className="pr-2 py-1">Entry</th>
                      <th className="pr-2 py-1">Mark</th>
                      <th className="py-1">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account!.positions!.map((p, i) => (
                      <tr key={i} style={{ color: "var(--text-secondary)" }}>
                        <td className="py-0.5 pr-2">{String(p.pair ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(p.side ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(p.quantity ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(p.entry_price ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(p.mark_price ?? "—")}</td>
                        <td className="py-0.5">{String(p.unrealised_pnl ?? p.pnl ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}>
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Open orders
            </div>
            {account?.configured && (account.openOrders?.length ?? 0) === 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                No open orders.
              </p>
            )}
            {account?.configured && (account.openOrders?.length ?? 0) > 0 && (
              <div className="overflow-x-auto text-[10px] font-mono max-h-48 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="pr-2 py-1">Side</th>
                      <th className="pr-2 py-1">Pair</th>
                      <th className="pr-2 py-1">Qty</th>
                      <th className="pr-2 py-1">Price</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(account!.openOrders! as Record<string, unknown>[]).map((o, i) => (
                      <tr key={i} style={{ color: "var(--text-secondary)" }}>
                        <td className="py-0.5 pr-2">{String(o.side ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(o.pair ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(o.total_quantity ?? o.quantity ?? "—")}</td>
                        <td className="py-0.5 pr-2">{String(o.price_per_unit ?? o.price ?? "—")}</td>
                        <td className="py-0.5">{String(o.status ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{ background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}>
          <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            Recent public trades · {pair}
          </div>
          <div className="overflow-x-auto text-[11px] font-mono max-h-56 overflow-y-auto">
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
                {trades.slice(0, 24).map((t, i) => {
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
            {trades.length === 0 && <div style={{ color: "var(--text-muted)" }}>No trades</div>}
          </div>
        </div>

        {logLines.length > 0 && (
          <div className="rounded-xl border p-3 font-mono text-[10px]" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
            <div className="uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
              Activity
            </div>
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              {logLines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] leading-relaxed max-w-4xl" style={{ color: "var(--text-muted)" }}>
          Layout mirrors your <strong>coindcx-bot</strong> TUI: order book + depth, MTF strip, SMC / setup text, positions, and
          orders. Public data uses CoinDCX REST; live BTC/ETH/SOL uses <code className="text-[10px]">/market/ws</code>.{" "}
          <strong>Equity / wallet / INR</strong> rows are not wired yet (needs the same balance endpoints as the bot).{" "}
          <strong>Orderflow / regime / signal history</strong> can be added by persisting bot events or calling extra public
          endpoints. Set <code className="text-[10px]">COINDCX_API_KEY</code> +{" "}
          <code className="text-[10px]">COINDCX_API_SECRET</code> on the server for positions and open orders.
        </p>
      </div>
    </div>
  );
}
