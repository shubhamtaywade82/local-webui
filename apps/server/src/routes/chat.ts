import { FastifyInstance } from "fastify";
import { OllamaClient } from "@workspace/ollama-client";
import { KnowledgeEngine } from "@workspace/knowledge-engine";
import { db } from "../services/db";
import { summarizeConversation } from "../services/summarizer";
import path from "path";

const ollama = new OllamaClient();
const knowledge = new KnowledgeEngine(path.join(process.cwd(), "../../knowledge"));

export default async function routes(app: FastifyInstance) {
  app.post("/", async (req, res) => {
    const { messages, model, conversation_id } = req.body as { messages: any[]; model: string; conversation_id?: string };
    const lastUserMessage = messages[messages.length - 1]?.content || "";

    let currentConversationId = conversation_id;
    if (!currentConversationId) {
      currentConversationId = await db.createConversation(lastUserMessage.slice(0, 30), model);
    }

    // 1. Retrieve Knowledge (RAG)
    const contextDocs = knowledge.retrieve(lastUserMessage);
    const contextString = contextDocs.map(d => `FILE: ${d.path}\nCONTENT: ${d.content}`).join("\n\n");

    // 2. Prepare Context (History)
    const history = await db.getMessages(currentConversationId);
    let historyContext = "";
    if (history.length > 10) {
      const historyText = history.map(m => `${m.role}: ${m.content}`).join("\n");
      const summary = await summarizeConversation(historyText);
      historyContext = `Conversation Summary:\n${summary}`;
    }

    // 3. Prepare System Prompt
    const systemPrompt = {
      role: 'system',
      content: `You are a local AI assistant. 
Use the following context if relevant to the question. 
If not found in context, answer normally.

${historyContext}

CONTEXT:
${contextString || "No relevant local knowledge found."}`
    };

    const finalMessages = [systemPrompt, ...messages];

    // Persist user message
    await db.saveMessage(currentConversationId, 'user', lastUserMessage);

    res.raw.setHeader("Content-Type", "text/event-stream");
    res.raw.setHeader("Cache-Control", "no-cache");
    res.raw.setHeader("Connection", "keep-alive");

    let fullAssistantResponse = "";
    await ollama.stream(model || "qwen2.5:0.5b", finalMessages, (token) => {
      fullAssistantResponse += token;
      res.raw.write(`data: ${JSON.stringify({ token, conversation_id: currentConversationId })}\n\n`);
    });

    // Persist assistant message
    await db.saveMessage(currentConversationId, 'assistant', fullAssistantResponse);

    res.raw.end();
  });
}