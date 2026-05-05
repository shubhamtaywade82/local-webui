const PING_TIMEOUT_MS = Number(process.env.COMFYUI_HEALTH_TIMEOUT_MS) || 10_000;

/** Paths that return 200 on a healthy ComfyUI (try in order). */
const PING_PATHS = ["/system_stats", "/queue", "/"] as const;

function formatFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts: string[] = [e.message];
  const err = e as Error & { cause?: unknown };
  if (err.cause instanceof Error) {
    parts.push(`cause: ${err.cause.message}`);
    const ce = err.cause as NodeJS.ErrnoException;
    if (typeof ce.code === "string") parts.push(`code: ${ce.code}`);
  }
  return parts.join(" — ");
}

export type ComfyPingResult =
  | { ok: true; path: string; status: number }
  | { ok: false; error: string; tried: string[] };

/**
 * Probe ComfyUI HTTP API. Tries several paths because older builds may not expose `/system_stats`.
 */
export async function pingComfyUi(base: string): Promise<ComfyPingResult> {
  const tried: string[] = [];
  let lastError = "unknown";

  for (const path of PING_PATHS) {
    const url = `${base}${path === "/" ? "/" : path}`;
    tried.push(path);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        headers: { Accept: "application/json, text/html, */*" },
      });
      if (res.ok) {
        return { ok: true, path, status: res.status };
      }
      lastError = `${path} → HTTP ${res.status}`;
    } catch (e) {
      lastError = formatFetchError(e);
    }
  }

  return { ok: false, error: lastError, tried };
}
