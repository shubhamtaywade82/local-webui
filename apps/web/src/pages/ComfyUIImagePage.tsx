import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Loader2, Play, FileJson } from 'lucide-react';
import sampleWorkflow from '../data/comfyui-sample-workflow.json';

type Health = {
  ok?: boolean;
  configured?: boolean;
  baseUrl?: string;
  message?: string;
  error?: string;
  pingPath?: string;
  triedPaths?: string[];
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

/** User-friendly hint when pasted content is not Comfy API JSON. */
function describeWorkflowParseIssue(raw: string): string {
  const t = raw.trim();
  if (!t) return "Paste the workflow JSON exported from ComfyUI.";
  const first = t[0];
  if (first !== "{" && first !== "[") {
    return (
      "That looks like plain text, not ComfyUI API JSON. This field must be the exported graph: a JSON object starting " +
      'with an opening brace, with keys like "3" / "6" and values that include class_type (e.g. CLIPTextEncode, KSampler). ' +
      "Put your scene description inside CLIP Text Encode in ComfyUI, then use Save (API Format) or Export API and paste the whole JSON here."
    );
  }
  return (
    "JSON parse failed. Paste only the API export: no text before the first { or after the final }."
  );
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
      setStatus(describeWorkflowParseIssue(workflowJson));
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
        const err = (data as { error?: string }).error;
        if (res.status === 503 && err === "comfyui_not_configured") {
          setStatus(
            "ComfyUI is not configured on the API server. Add COMFYUI_BASE_URL (e.g. http://127.0.0.1:8188) to apps/server/.env, restart pnpm dev, then refresh this page."
          );
        } else {
          setStatus(`ComfyUI rejected prompt (${res.status}): ${JSON.stringify(data).slice(0, 800)}`);
        }
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

  const notConfigured = health !== null && health.configured !== true;
  const configuredButUnreachable = health?.configured === true && health.ok !== true;

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
          {notConfigured && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(220, 38, 38, 0.12)",
                border: "1px solid rgba(220, 38, 38, 0.35)",
                color: "var(--text-primary)",
              }}
            >
              <strong>COMFYUI_BASE_URL is not set.</strong> The API server loads{" "}
              <code className="text-xs">apps/server/.env</code> (cwd when you run the server is usually{" "}
              <code className="text-xs">apps/server</code>). Add one line, restart the server, then click Refresh status:
              <pre
                className="mt-2 p-2 rounded text-xs overflow-x-auto"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}
              >
                COMFYUI_BASE_URL=http://127.0.0.1:8188
              </pre>
            </div>
          )}
          {configuredButUnreachable && (
            <div
              className="rounded-xl px-4 py-3 text-sm space-y-2"
              style={{
                background: "rgba(234, 179, 8, 0.12)",
                border: "1px solid rgba(234, 179, 8, 0.35)",
                color: "var(--text-primary)",
              }}
            >
              <p>
                <strong>Could not reach ComfyUI at {health?.baseUrl ?? "COMFYUI_BASE_URL"}.</strong> Start ComfyUI (API
                default port <code className="text-xs">8188</code>), confirm the URL, then Refresh status.
              </p>
              {health?.error && (
                <p className="text-xs font-mono break-all" style={{ color: "var(--text-secondary)" }}>
                  {health.error}
                </p>
              )}
              {health?.triedPaths && health.triedPaths.length > 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Tried GET paths: {health.triedPaths.join(", ")}
                </p>
              )}
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                <strong>WSL2:</strong> if ComfyUI runs on Windows and this API runs inside Linux,{" "}
                <code className="text-[10px]">127.0.0.1</code> is the Linux VM, not Windows — use your Windows host IP
                (e.g. from <code className="text-[10px]">ip route</code> default via) or run ComfyUI inside WSL.
              </p>
            </div>
          )}

          <div className="text-sm space-y-2 rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              This page sends a <strong style={{ color: "var(--text-primary)" }}>workflow graph as JSON</strong> to your
              ComfyUI server (<code className="text-xs">COMFYUI_BASE_URL</code>). It does <strong style={{ color: "var(--text-primary)" }}>not</strong> accept a plain-text image description by itself.
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
              <li>Open ComfyUI in the browser (your local install).</li>
              <li>Build or load a workflow; put your scene description in a <strong>CLIP Text Encode</strong> (or equivalent) node there.</li>
              <li>
                Export <strong>API format</strong>: e.g. menu <strong>Save (API Format)</strong> / export API JSON — you
                should get one JSON object whose keys are string node ids (<code className="text-[10px]">"6"</code>,{" "}
                <code className="text-[10px]">"10"</code>, …) and values include <code className="text-[10px]">class_type</code>.
              </li>
              <li>Paste that entire JSON into the box below and click Run.</li>
            </ol>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Reference:{" "}
              <a
                href="https://github.com/comfyanonymous/ComfyUI/wiki"
                target="_blank"
                rel="noreferrer"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                ComfyUI wiki
              </a>
              .
            </p>
          </div>

          <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Workflow (API JSON — not your English prompt)
          </label>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Tip: edit node <code className="text-[10px]">4</code> field <code className="text-[10px]">ckpt_name</code> to match a
            file in ComfyUI <code className="text-[10px]">models/checkpoints</code> (sample uses{" "}
            <code className="text-[10px]">v1-5-pruned-emaonly.safetensors</code>).
          </p>
          <textarea
            value={workflowJson}
            onChange={(e) => setWorkflowJson(e.target.value)}
            disabled={busy || notConfigured}
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
              onClick={() => {
                setWorkflowJson(JSON.stringify(sampleWorkflow, null, 2));
                setStatus("");
              }}
              disabled={busy || notConfigured}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
              title="Minimal txt2img graph: CheckpointLoader → CLIP encode → KSampler → VAE decode → SaveImage"
            >
              <FileJson size={16} />
              Load sample JSON
            </button>
            <button
              type="button"
              onClick={() => void runWorkflow()}
              disabled={busy || !workflowJson.trim() || notConfigured}
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
