import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Loader2, Play } from 'lucide-react';

type Health = {
  ok?: boolean;
  configured?: boolean;
  baseUrl?: string;
  message?: string;
  error?: string;
};

type ImageRef = { filename: string; subfolder: string; type: string };

function getAuthHeaders(): Record<string, string> {
  try {
    const token = JSON.parse(localStorage.getItem('ai-workspace-auth') || '{}').token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function collectImagesFromHistoryPayload(data: unknown, _promptId: string): ImageRef[] {
  const out: ImageRef[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    const rec = o as Record<string, unknown>;
    if (Array.isArray(rec.images)) {
      for (const img of rec.images) {
        if (img && typeof img === "object" && "filename" in img) {
          const i = img as Record<string, string>;
          out.push({
            filename: String(i.filename),
            subfolder: String(i.subfolder ?? ""),
            type: String(i.type ?? "output"),
          });
        }
      }
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(data);
  const seen = new Set<string>();
  return out.filter((im) => {
    const k = `${im.type}|${im.subfolder}|${im.filename}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function viewUrl(ref: ImageRef): string {
  const p = new URLSearchParams({
    filename: ref.filename,
    type: ref.type,
    subfolder: ref.subfolder,
  });
  return `/api/comfyui/view?${p.toString()}`;
}

export default function ComfyUIImagePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [workflowJson, setWorkflowJson] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<ImageRef[]>([]);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/comfyui/health", { headers: getAuthHeaders() });
      setHealth((await res.json()) as Health);
    } catch {
      setHealth({ ok: false, configured: false, error: "Request failed" });
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const runWorkflow = useCallback(async () => {
    let prompt: unknown;
    try {
      prompt = JSON.parse(workflowJson) as unknown;
    } catch {
      setStatus("Invalid JSON in workflow field.");
      return;
    }
    if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
      setStatus("Workflow must be a JSON object (ComfyUI API format).");
      return;
    }

    setBusy(true);
    setStatus("Submitting to ComfyUI…");
    setImages([]);
    try {
      const res = await fetch("/api/comfyui/prompt", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const raw = await res.text();
      let data: { prompt_id?: string; error?: unknown; node_errors?: unknown };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        setStatus(`ComfyUI error (${res.status}): ${raw.slice(0, 400)}`);
        setBusy(false);
        return;
      }
      if (!res.ok) {
        setStatus(`ComfyUI rejected prompt (${res.status}): ${JSON.stringify(data).slice(0, 800)}`);
        setBusy(false);
        return;
      }
      const promptId = data.prompt_id;
      if (!promptId) {
        setStatus(`Unexpected response: ${raw.slice(0, 400)}`);
        setBusy(false);
        return;
      }

      setStatus(`Queued (${promptId}). Waiting for output…`);
      const deadline = Date.now() + 120_000;
      let found: ImageRef[] = [];
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 600));
        const h = await fetch(`/api/comfyui/history/${encodeURIComponent(promptId)}`, {
          headers: getAuthHeaders(),
        });
        const histText = await h.text();
        let hist: unknown;
        try {
          hist = JSON.parse(histText);
        } catch {
          continue;
        }
        found = collectImagesFromHistoryPayload(hist, promptId);
        if (found.length > 0) break;
      }
      if (found.length === 0) {
        setStatus("Timed out waiting for images. Check ComfyUI console / queue.");
      } else {
        setStatus(`Done — ${found.length} image(s).`);
        setImages(found);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [workflowJson]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      <header
        className="flex items-center justify-between px-4 flex-shrink-0 border-b"
        style={{
          height: "var(--header-height)",
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
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
          <div className="min-w-0 flex items-center gap-2">
            <ImageIcon size={18} style={{ color: "var(--accent)" }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                ComfyUI images
              </div>
              <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                {health?.configured
                  ? health.ok
                    ? `Reachable · ${health.baseUrl ?? ""}`
                    : `Configured but unreachable${health.error ? ` — ${health.error}` : ""}`
                  : health?.message || "Set COMFYUI_BASE_URL on the server"}
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshHealth()}
          className="text-[11px] px-2 py-1 rounded-md hover:bg-white/5"
          style={{ border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
        >
          Refresh status
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Export a workflow as <strong>API (JSON)</strong> from ComfyUI, paste it below, then run. The server proxies
            requests to <code className="text-xs">COMFYUI_BASE_URL</code> so the browser does not need direct access to
            ComfyUI.
          </p>

          <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Workflow (API JSON)
          </label>
          <textarea
            value={workflowJson}
            onChange={(e) => setWorkflowJson(e.target.value)}
            disabled={busy}
            rows={14}
            spellCheck={false}
            placeholder='{ "3": { "class_type": "KSampler", ... }, ... }'
            className="w-full rounded-xl text-xs font-mono p-3 outline-none resize-y min-h-[200px]"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void runWorkflow()}
              disabled={busy || !workflowJson.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, var(--accent), #6346d9)",
                color: "#fff",
              }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Run in ComfyUI
            </button>
            {status && (
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {status}
              </span>
            )}
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              {images.map((ref) => (
                <a
                  key={`${ref.type}-${ref.subfolder}-${ref.filename}`}
                  href={viewUrl(ref)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl overflow-hidden border"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <img
                    src={viewUrl(ref)}
                    alt={ref.filename}
                    className="w-full h-auto object-contain max-h-[70vh]"
                    style={{ background: "var(--bg-tertiary)" }}
                  />
                  <div className="text-[10px] px-2 py-1 truncate" style={{ color: "var(--text-muted)" }}>
                    {ref.filename}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
