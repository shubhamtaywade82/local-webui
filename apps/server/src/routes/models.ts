import { FastifyInstance } from "fastify";
import {
  getOllamaBase,
  getOllamaHeaders,
  resolveOllamaProvider,
} from "@workspace/ollama-client";

type ModelsQuery = {
  provider?: string;
};

export default async function routes(app: FastifyInstance) {
  // List available Ollama models
  app.get("/", async (req, res) => {
    const provider = resolveOllamaProvider((req.query as ModelsQuery | undefined)?.provider);
    try {
      const ollamaRes = await fetch(`${getOllamaBase(provider)}/api/tags`, {
        headers: getOllamaHeaders(provider)
      });
      if (!ollamaRes.ok) {
        res.code(502).send({ error: "Ollama unreachable", status: ollamaRes.status });
        return;
      }
      const data = await ollamaRes.json() as { models?: any[] };
      return {
        provider,
        models: (data.models || []).map((m: any) => ({
          name: m.name,
          size: m.size,
          modified: m.modified_at,
          digest: m.digest?.slice(0, 12)
        }))
      };
    } catch (err) {
      console.error("[ModelsRoute] Error fetching models:", err);
      res.code(502).send({ error: "Could not connect to Ollama" });
    }
  });

  // Health check for Ollama
  app.get("/health", async (req, res) => {
    const provider = resolveOllamaProvider((req.query as ModelsQuery | undefined)?.provider);
    try {
      const ollamaRes = await fetch(`${getOllamaBase(provider)}/api/tags`, {
        headers: getOllamaHeaders(provider)
      });
      return {
        provider,
        ollama: ollamaRes.ok ? "connected" : "error",
        timestamp: new Date().toISOString()
      };
    } catch {
      return { provider, ollama: "disconnected", timestamp: new Date().toISOString() };
    }
  });
}
