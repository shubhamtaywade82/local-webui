/**
 * Base URL for a local ComfyUI server (e.g. http://127.0.0.1:8188).
 * When unset, ComfyUI routes return `configured: false` from /health and 503 from other endpoints.
 */
export function resolveComfyUiBaseUrl(): string | null {
  const raw = process.env.COMFYUI_BASE_URL?.trim();
  if (!raw) return null;
  let u = raw.replace(/\/+$/, "");
  // If user pasted the web UI URL, strip trailing /ui so API paths resolve.
  u = u.replace(/\/(ui)\/?$/i, "");
  return u;
}
