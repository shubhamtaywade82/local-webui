import { FastifyInstance } from "fastify";
import { OllamaClient } from "@workspace/ollama-client";
import { KnowledgeEngine } from "@workspace/knowledge-engine";
import path from "path";

const ollama = new OllamaClient();
const knowledge = new KnowledgeEngine(path.join(process.cwd(), "../../knowledge"));

export default async function routes(app: FastifyInstance) {
  app.head("/", async (_req, res) => {
    return res.status(200).send();
  });

  app.post("/", async (req, res) => {
    const { messages, model } = req.body as { messages: any[]; model: string };
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || "";

    // 1. Retrieve Knowledge (RAG)
    const contextDocs = knowledge.retrieve(lastUserMessage);
    const contextString = contextDocs.map(d => `FILE: ${d.path}\nCONTENT: ${d.content}`).join("\n\n");

    // 2. Prepare System Prompt
    const systemPrompt = {
      role: 'system',
      content: `You are a local AI assistant. 
Use the following context if relevant to the question. 
If not found in context, answer normally.

CONTEXT:
${contextString || "No relevant local knowledge found."}`
    };

    const finalMessages = [systemPrompt, ...messages];

    res.raw.setHeader("Content-Type", "text/event-stream");
    res.raw.setHeader("Cache-Control", "no-cache");
    res.raw.setHeader("Connection", "keep-alive");

    await ollama.stream(model || "qwen2.5:0.5b", finalMessages, (token) => {
      res.raw.write(`data: ${JSON.stringify({ token })}\n\n`);
    });

    res.raw.end();
  });
}