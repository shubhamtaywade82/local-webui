import { FastifyInstance } from "fastify";
import { OllamaClient } from "@workspace/ollama-client";
import { KnowledgeEngine } from "@workspace/knowledge-engine";
import { db } from "../services/db";
import { summarizeConversation } from "../services/summarizer";
import path from "path";

const ollama = new OllamaClient();
const knowledge = new KnowledgeEngine(path.join(process.cwd(), "../../options-buying-kb"));

export default async function routes(app: FastifyInstance) {
  app.post("/", async (req, res) => {
    const { messages, model, conversation_id, systemPrompt: customSystemPrompt } = req.body as { messages: any[]; model: string; conversation_id?: string; systemPrompt?: string };
    const lastUserMessage = messages[messages.length - 1]?.content || "";

    let currentConversationId = conversation_id;
    if (!currentConversationId) {
      currentConversationId = await db.createConversation(lastUserMessage.slice(0, 30), model);
    }

    // 1. Retrieve Knowledge (RAG)
    const contextDocs = await knowledge.retrieve(lastUserMessage);
    const availableFiles = knowledge.listAll();
    const contextString = contextDocs.map(d => `FILE: ${d.path}\nCONTENT: ${d.content}`).join("\n\n");

    // 2. Prepare Context (History)
    const history = await db.getMessages(currentConversationId);
    let historyContext = "";
    if (history.length > 10) {
      const historyText = history.map((m: any) => `${m.role}: ${m.content}`).join("\n");
      const summary = await summarizeConversation(historyText);
      historyContext = `Conversation Summary:\n${summary}`;
    }

    // 3. Prepare System Prompt
    const basePrompt = customSystemPrompt?.trim() ? customSystemPrompt : "You are a local AI assistant.";
    let systemPromptText = `${basePrompt} 
Use the following context if relevant to the question. 
If not found in context, answer normally.

AVAILABLE LOCAL FILES:
${availableFiles.join(", ") || "No local files indexed."}

${historyContext}

CONTEXT FROM DOCUMENTS:
${contextString || "No specific content match found in local knowledge."}`;

    const { thinking } = req.body as { thinking?: boolean };
    if (thinking) {
      systemPromptText += `\n\nTHINKING MODE ENABLED:
You MUST reason step-by-step before providing your final answer.
Wrap your internal reasoning process entirely within <think>...</think> tags.
Example:
<think>
I need to calculate X.
Step 1: ...
Step 2: ...
</think>
Final Answer: ...`;
    }

    const systemPrompt = {
      role: 'system',
      content: systemPromptText
    };

    const finalMessages = [systemPrompt, ...messages];
    console.log(`[ChatRoute] Sending ${finalMessages.length} messages to Ollama. System prompt length: ${systemPrompt.content.length}`);
    // console.log("[ChatRoute] System Prompt Content:", systemPrompt.content); // Uncomment for extreme debugging

    // Persist user message
    await db.saveMessage(currentConversationId, 'user', lastUserMessage);

    res.raw.setHeader("Content-Type", "text/event-stream");
    res.raw.setHeader("Cache-Control", "no-cache");
    res.raw.setHeader("Connection", "keep-alive");

    let fullAssistantResponse = "";
    // Send sources first
    console.log(`[ChatRoute] Found ${contextDocs.length} sources. Sending metadata...`);
    res.raw.write(`data: ${JSON.stringify({ sources: contextDocs.map(d => d.path), conversation_id: currentConversationId })}\n\n`);

    try {
      console.log(`[ChatRoute] Starting Ollama stream for model: ${model || "qwen2.5:0.5b"}`);
      await ollama.stream(model || "qwen2.5:0.5b", finalMessages, (token) => {
        fullAssistantResponse += token;
        res.raw.write(`data: ${JSON.stringify({ token, conversation_id: currentConversationId })}\n\n`);
      });
      console.log(`[ChatRoute] Ollama stream finished. Total tokens: ${fullAssistantResponse.length}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ChatRoute] Stream error: ${errorMsg}`);
      res.raw.write(`data: ${JSON.stringify({ error: errorMsg, conversation_id: currentConversationId })}\n\n`);
      res.raw.end();
      return;
    }

    // Persist assistant message
    if (fullAssistantResponse) {
      await db.saveMessage(currentConversationId, 'assistant', fullAssistantResponse);
    }

    res.raw.end();
  });
}