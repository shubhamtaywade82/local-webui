import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { resolveComfyUiBaseUrl } from "../config/comfyuiBase";
import { pingComfyUi } from "../services/comfyuiPing";

async function forwardJson(res: Response, reply: FastifyReply) {
  const text = await res.text();
  const ct = res.headers.get("content-type") || "application/json";
  reply.code(res.status);
  reply.header("Content-Type", ct);
  return reply.send(text);
}

async function forwardBinary(res: Response, reply: FastifyReply) {
  const buf = Buffer.from(await res.arrayBuffer());
  reply.code(res.status);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  reply.header("Content-Type", ct);
  return reply.send(buf);
}

export default async function routes(app: FastifyInstance) {
  app.get("/health", async () => {
    const base = resolveComfyUiBaseUrl();
    if (!base) {
      return { ok: false, configured: false, message: "Set COMFYUI_BASE_URL (e.g. http://127.0.0.1:8188)" };
    }
    const ping = await pingComfyUi(base);
    if (ping.ok) {
      return {
        ok: true,
        configured: true,
        baseUrl: base,
        pingPath: ping.path,
        comfyStatus: ping.status,
      };
    }
    return {
      ok: false,
      configured: true,
      baseUrl: base,
      error: ping.error,
      triedPaths: ping.tried,
    };
  });

  app.post("/prompt", async (req: FastifyRequest, reply: FastifyReply) => {
    const base = resolveComfyUiBaseUrl();
    if (!base) {
      return reply.code(503).send({ error: "comfyui_not_configured" });
    }
    const body = req.body as { prompt?: unknown; client_id?: string } | undefined;
    if (!body?.prompt || typeof body.prompt !== "object" || Array.isArray(body.prompt)) {
      return reply.code(400).send({ error: "prompt_required", message: "Body must include a JSON object `prompt` (ComfyUI API-format workflow)." });
    }
    const clientId = typeof body.client_id === "string" && body.client_id.trim() ? body.client_id.trim() : randomUUID();
    const res = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: body.prompt, client_id: clientId }),
    });
    return forwardJson(res, reply);
  });

  app.get("/history/:promptId", async (req: FastifyRequest, reply: FastifyReply) => {
    const base = resolveComfyUiBaseUrl();
    if (!base) {
      return reply.code(503).send({ error: "comfyui_not_configured" });
    }
    const { promptId } = req.params as { promptId: string };
    const res = await fetch(`${base}/history/${encodeURIComponent(promptId)}`);
    return forwardJson(res, reply);
  });

  /** Proxy rendered images (query: filename, type, subfolder — same as ComfyUI /view). */
  app.get("/view", async (req: FastifyRequest, reply: FastifyReply) => {
    const base = resolveComfyUiBaseUrl();
    if (!base) {
      return reply.code(503).send({ error: "comfyui_not_configured" });
    }
    const q = req.query as Record<string, string | undefined>;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") sp.set(k, v);
    }
    const res = await fetch(`${base}/view?${sp.toString()}`);
    return forwardBinary(res, reply);
  });
}
