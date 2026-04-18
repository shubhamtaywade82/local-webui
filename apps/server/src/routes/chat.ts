import { FastifyInstance } from "fastify";
import { OllamaClient } from "@workspace/ollama-client";
import { db } from "../services/db";
import { summarizeConversation } from "../services/summarizer";
import { knowledgeEngine } from "../services/knowledgeSingleton";

const ollama = new OllamaClient();
const knowledge = knowledgeEngine;

export default async function routes(app: FastifyInstance) {
  app.get("/", { websocket: true }, (connection, req) => {
    handleWs(connection, req);
  });
}

function handleWs(connection: any, req: any) {
  connection.socket.on("message", async (rawMessage: Buffer) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        const { messages, model, conversation_id, systemPrompt: customSystemPrompt, thinking } = payload;
        
        if (!messages || !messages.length) return;
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
${contextString || "No specific content match found in local knowledge."}

TOOL USAGE:
You can actively modify files in the user's Editor using the edit_file tool.
To use it, strictly follow this format in your response:
<tool>edit_file</tool>
<path>src/filename.ext</path>
<content>
// Code goes here
</content>`;

        if (thinking) {
          systemPromptText += `\n\nTHINKING MODE ENABLED:
You MUST reason step-by-step before providing your final answer.
Wrap your internal reasoning process entirely within <think>...</think> tags.`;
        }

        const systemPromptMsg = { role: 'system', content: systemPromptText };
        const finalMessages = [systemPromptMsg, ...messages];

        console.log(`[ChatRoute] Sending WS for conversation: ${currentConversationId}`);

        // Persist user message
        await db.saveMessage(currentConversationId, 'user', lastUserMessage);

        connection.socket.send(JSON.stringify({ 
          type: 'sources', 
          sources: contextDocs.map(d => d.path), 
          conversation_id: currentConversationId 
        }));

        let fullAssistantResponse = "";
        let buffer = "";
        let stepsEmitted = new Set<string>();
        const startTime = Date.now();

        const emitStep = (id: string, label: string, status: 'running' | 'success', tool?: string) => {
          if (status === 'success' && stepsEmitted.has(id)) return; // Don't repeat successful steps
          connection.socket.send(JSON.stringify({
            type: 'agent_step',
            step: {
              id,
              label,
              tool,
              status,
              timestamp: Date.now(),
              duration: Date.now() - startTime
            },
            conversation_id: currentConversationId
          }));
          if (status === 'success') stepsEmitted.add(id);
        };

        // Initial step: Planning
        emitStep('planning', 'Planning execution strategy', 'success');
        
        try {
          await ollama.stream(model || "qwen2.5:0.5b", finalMessages, (token) => {
            fullAssistantResponse += token;
            buffer += token;

            // Stream token to user normally
            connection.socket.send(JSON.stringify({ 
              type: 'token', 
              token, 
              conversation_id: currentConversationId 
            }));

            // Detect Thinking
            if (buffer.includes("<think>") && !stepsEmitted.has('thinking')) {
              emitStep('thinking', 'Reasoning step-by-step', 'running');
            }
            if (buffer.includes("</think>") && !stepsEmitted.has('thinking-done')) {
              emitStep('thinking', 'Reasoning complete', 'success');
              stepsEmitted.add('thinking-done');
            }

            // Detect Tool Usage
            if (buffer.includes("<tool>edit_file</tool>")) {
              if (!stepsEmitted.has('tool-edit-file')) {
                emitStep('tool-edit-file', 'Preparing to edit file', 'running', 'edit_file');
              }
              
              if (buffer.includes("</content>")) {
                const pathMatch = buffer.match(/<path>(.*?)<\/path>/);
                const contentMatch = buffer.match(/<content>([\s\S]*?)<\/content>/);
                
                if (pathMatch && contentMatch) {
                  const filePath = pathMatch[1].trim();
                  const fileContent = contentMatch[1].trim();
                  
                  emitStep('tool-edit-file', `Modified ${filePath}`, 'success', 'edit_file');
                  
                  console.log(`[ChatRoute] Emitting edit_file tool event for ${filePath}`);
                  connection.socket.send(JSON.stringify({
                    type: 'tool_call',
                    tool: 'edit_file',
                    path: filePath,
                    content: fileContent,
                    conversation_id: currentConversationId
                  }));

                  // Clear buffer after extracting tool call to prevent multiple triggers
                  buffer = buffer.substring(buffer.indexOf("</content>") + "</content>".length);
                }
              }
            }
          });

          // Final step
          emitStep('synthesis', 'Finalizing response', 'success');

          connection.socket.send(JSON.stringify({ 
            type: 'done', 
            conversation_id: currentConversationId 
          }));

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[ChatRoute] WS Stream error: ${errorMsg}`);
          emitStep('error', `Error: ${errorMsg}`, 'success');
          connection.socket.send(JSON.stringify({ 
            type: 'error', 
            error: errorMsg, 
            conversation_id: currentConversationId 
          }));
        }

        if (fullAssistantResponse) {
          await db.saveMessage(currentConversationId, 'assistant', fullAssistantResponse);
        }

      } catch (err) {
        console.error("[ChatRoute] Failed to parse message:", err);
      }
    });

    connection.socket.on("close", () => {
      console.log("[ChatRoute] WS Connection closed");
    });
}