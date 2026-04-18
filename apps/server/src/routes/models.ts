import { FastifyInstance } from "fastify";

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";

export default async function routes(app: FastifyInstance) {
  // List available Ollama models
  app.get("/", async (_req, res) => {
    try {
      const ollamaRes = await fetch(`${OLLAMA_BASE}/api/tags`);
      if (!ollamaRes.ok) {
        res.code(502).send({ error: "Ollama unreachable", status: ollamaRes.status });
        return;
      }
      const data = await ollamaRes.json() as { models?: any[] };
      return {
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
  app.get("/health", async (_req, res) => {
    try {
      const ollamaRes = await fetch(`${OLLAMA_BASE}/api/tags`);
      return {
        ollama: ollamaRes.ok ? "connected" : "error",
        timestamp: new Date().toISOString()
      };
    } catch {
      return { ollama: "disconnected", timestamp: new Date().toISOString() };
    }
  });
}
