import path from "path";
import jwt from "jsonwebtoken";
import { FastifyInstance } from "fastify";
import {
  createOllamaClient,
  getFallbackChatModel,
  resolveOllamaProvider,
} from "@workspace/ollama-client";
import {
  AgentRuntime,
  AgentConfig,
  StepApprovalFn,
  LoopEvent,
  humanizePendingStepLabel
} from "@workspace/agent-runtime";
import {
  ToolRegistry,
  ReadFileTool, ListFilesTool, EditFileTool, CreateFileTool, DeleteFileTool,
  QueryDatabaseTool, DescribeSchemaTool,
  SearchKbTool, IngestDocumentTool,
  RunCodeTool,
  WebSearchTool, FetchUrlTool,
} from "@workspace/tools";
import { db } from "../services/db";
import { summarizeConversation } from "../services/summarizer";
import { knowledgeEngine } from "../services/knowledgeSingleton";

const knowledge = knowledgeEngine;
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-prod';

// Workspace root for file tools: repo root (two levels up from apps/server/src/routes)
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../../../..');

function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new ReadFileTool(WORKSPACE_ROOT));
  registry.register(new ListFilesTool(WORKSPACE_ROOT));
  registry.register(new EditFileTool(WORKSPACE_ROOT));
  registry.register(new CreateFileTool(WORKSPACE_ROOT));
  registry.register(new DeleteFileTool(WORKSPACE_ROOT));
  registry.register(new QueryDatabaseTool());
  registry.register(new DescribeSchemaTool());
  registry.register(new SearchKbTool(knowledge));
  registry.register(new IngestDocumentTool(knowledge));
  registry.register(new RunCodeTool());
  registry.register(new WebSearchTool());
  registry.register(new FetchUrlTool());
  return registry;
}

export default async function routes(app: FastifyInstance) {
  app.get("/", { websocket: true }, (connection, req) => {
    handleWs(connection, req);
  });
}

function extractUserIdFromReq(req: any): string | undefined {
  const auth = req.headers?.authorization as string | undefined;
  if (!auth?.startsWith('Bearer ')) return undefined;
  try {
    const p = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string };
    return p.userId;
  } catch { return undefined; }
}

function handleWs(connection: any, req: any) {
  const headerUserId = extractUserIdFromReq(req);

  connection.socket.on("message", async (rawMessage: Buffer) => {
    try {
      const payload = JSON.parse(rawMessage.toString());

      // Step approval messages are handled by the approvalListener inside agent runs — ignore here
      if (payload.type === 'agent_step_approve' || payload.type === 'agent_step_reject') return;

      const {
        messages, model, conversation_id, systemPrompt: customSystemPrompt,
        thinking, agentMode, maxIterations, agentStepMode, token: payloadToken,
        provider
      } = payload;
      const requestedProvider = resolveOllamaProvider(provider);
      const requestedModel =
        typeof model === "string" && model.trim()
          ? model.trim()
          : getFallbackChatModel(requestedProvider);
      const ollama = createOllamaClient(requestedProvider);

      // userId from WS upgrade headers OR from first-message token (WS can't send custom headers)
      let userId = headerUserId;
      if (!userId && payloadToken) {
        try {
          const p = jwt.verify(payloadToken, JWT_SECRET) as { userId: string };
          userId = p.userId;
        } catch {}
      }

      if (!messages || !messages.length) return;
      const lastUserMessage = messages[messages.length - 1]?.content || "";
      const conversationTitle = lastUserMessage.slice(0, 30);

      let currentConversationId = conversation_id;
      if (!currentConversationId) {
        currentConversationId = await db.createConversation(conversationTitle, requestedModel, userId);
      } else {
        // Client generates UUIDs in the browser before any DB row exists; create the row if missing.
        await db.ensureConversation(currentConversationId, conversationTitle, requestedModel, userId);
      }

      // 1. Retrieve Knowledge (RAG)
      const contextDocs = await knowledge.retrieve(lastUserMessage, {}, requestedProvider);
      const availableFiles = knowledge.listAll();
      const contextString = contextDocs.map((d: any) => `FILE: ${d.path}\nCONTENT: ${d.content}`).join("\n\n");

      // 2. Prepare Context (History)
      const history = await db.getMessages(currentConversationId);
      let historyContext = "";
      if (history.length > 10) {
        const historyText = history.map((m: any) => `${m.role}: ${m.content}`).join("\n");
        const summary = await summarizeConversation(historyText, requestedModel, requestedProvider);
        historyContext = `Conversation Summary:\n${summary}`;
      }

      // 3. Prepare System Prompt (chat mode)
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

      // 4. Persist user message
      await db.saveMessage(currentConversationId, 'user', lastUserMessage);

      connection.socket.send(JSON.stringify({
        type: 'sources',
        sources: contextDocs.map((d: any) => d.path),
        conversation_id: currentConversationId
      }));

      let fullAssistantResponse = "";
      let savedMessageId: string | null = null;

      if (agentMode) {
        // ── Agent mode: ReAct loop ──
        const emitStepEvt = (id: string, label: string, status: 'running' | 'success' | 'error', tool?: string) => {
          connection.socket.send(JSON.stringify({
            type: 'agent_step',
            step: { id, label, tool, status, timestamp: Date.now() },
            conversation_id: currentConversationId
          }));
        };

        emitStepEvt('planning', 'Planning the next moves for your request…', 'success');

        const agentConfig: AgentConfig = {
          model: requestedModel,
          maxIterations: typeof maxIterations === 'number' ? maxIterations : 10,
          mode: agentStepMode === 'step' ? 'step' : 'auto',
        };

        const toolRegistry = createToolRegistry();
        const runtime = new AgentRuntime(ollama, toolRegistry, agentConfig);
        const pendingApprovals = new Map<string, { resolve: (v: boolean) => void }>();

        const approvalListener = (approvalMsg: Buffer) => {
          try {
            const msg = JSON.parse(approvalMsg.toString());
            if ((msg.type === 'agent_step_approve' || msg.type === 'agent_step_reject') && pendingApprovals.has(msg.stepId)) {
              pendingApprovals.get(msg.stepId)!.resolve(msg.type === 'agent_step_approve');
              pendingApprovals.delete(msg.stepId);
            }
          } catch {}
        };
        connection.socket.on('message', approvalListener);

        const onApproval: StepApprovalFn = (stepId, _toolName, _toolInput) => {
          return new Promise<boolean>((resolve) => {
            pendingApprovals.set(stepId, { resolve });
          });
        };

        try {
          await runtime.run(
            lastUserMessage,
            history.map((m: any) => ({ role: m.role, content: m.content })),
            (event: LoopEvent) => {
              if (event.type === 'token') {
                const token = String((event.payload as any).token ?? '');
                fullAssistantResponse += token;
                connection.socket.send(JSON.stringify({ type: 'token', token, conversation_id: currentConversationId }));
              } else if (event.type === 'agent_step') {
                connection.socket.send(JSON.stringify({ type: event.type, step: event.payload, conversation_id: currentConversationId }));
              } else if (event.type === 'agent_step_pending') {
                const p = event.payload as {
                  stepId?: string;
                  toolName?: string;
                  toolInput?: Record<string, unknown>;
                };
                const toolName = String(p.toolName ?? '');
                const toolInput = (p.toolInput ?? {}) as Record<string, unknown>;
                const label = humanizePendingStepLabel(toolName, toolInput);
                connection.socket.send(JSON.stringify({
                  type: event.type,
                  step: { ...p, label },
                  conversation_id: currentConversationId
                }));
              } else if (event.type === 'tool_call') {
                const p = event.payload as any;
                if (savedMessageId) {
                  db.saveAgentExecution(savedMessageId, p.tool, p.args, { result: p.result }, p.duration, 'success').catch(() => {});
                }
                if (p.tool === 'edit_file') {
                  connection.socket.send(JSON.stringify({
                    type: 'tool_call', tool: 'edit_file',
                    path: p.args.path, content: p.args.content,
                    conversation_id: currentConversationId
                  }));
                }
                if (p.tool === 'query_database') {
                  connection.socket.send(JSON.stringify({
                    type: 'sql_result',
                    query: p.args.sql,
                    result: p.result,
                    durationMs: p.duration,
                    conversation_id: currentConversationId
                  }));
                }
              } else if (event.type === 'done') {
                connection.socket.send(JSON.stringify({ type: 'done', conversation_id: currentConversationId }));
              } else if (event.type === 'error') {
                connection.socket.send(JSON.stringify({ type: 'error', error: (event.payload as any).error, conversation_id: currentConversationId }));
              }
            },
            agentConfig.mode === 'step' ? onApproval : undefined
          );
        } finally {
          connection.socket.off('message', approvalListener);
        }

      } else {
        // ── Chat mode: streaming path ──
        let buffer = "";
        let stepsEmitted = new Set<string>();
        const startTime = Date.now();

        const emitStep = (id: string, label: string, status: 'running' | 'success', tool?: string) => {
          if (status === 'success' && stepsEmitted.has(id)) return;
          connection.socket.send(JSON.stringify({
            type: 'agent_step',
            step: { id, label, tool, status, timestamp: Date.now(), duration: Date.now() - startTime },
            conversation_id: currentConversationId
          }));
          if (status === 'success') stepsEmitted.add(id);
        };

        emitStep('planning', 'Planning how to answer…', 'success');

        try {
          await ollama.stream(
            requestedModel,
            finalMessages,
            (token) => {
              fullAssistantResponse += token;
              buffer += token;

              connection.socket.send(JSON.stringify({ type: 'token', token, conversation_id: currentConversationId }));

              if (buffer.includes("<think>") && !stepsEmitted.has('thinking')) {
                emitStep('thinking', 'Reasoning step-by-step', 'running');
              }
              if (buffer.includes("</think>") && !stepsEmitted.has('thinking-done')) {
                emitStep('thinking', 'Reasoning complete', 'success');
                stepsEmitted.add('thinking-done');
              }

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
                    connection.socket.send(JSON.stringify({
                      type: 'tool_call', tool: 'edit_file',
                      path: filePath, content: fileContent,
                      conversation_id: currentConversationId
                    }));
                    buffer = buffer.substring(buffer.indexOf("</content>") + "</content>".length);
                  }
                }
              }
            },
            // UI "Thinking" uses XML in the system prompt only. Native Ollama `think: true` can stall
            // non–thinking-tuned models (e.g. llama3.2); explicitly turn native thinking off here.
            thinking ? { think: false } : undefined
          );

          emitStep('synthesis', 'Finalizing response', 'success');
          connection.socket.send(JSON.stringify({ type: 'done', conversation_id: currentConversationId }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[ChatRoute] WS Stream error: ${errorMsg}`);
          connection.socket.send(JSON.stringify({ type: 'error', error: errorMsg, conversation_id: currentConversationId }));
        }
      }

      if (fullAssistantResponse) {
        // Row may be missing if deleted mid-stream or ensure failed earlier; re-assert before FK insert.
        await db.ensureConversation(currentConversationId, conversationTitle, requestedModel, userId);
        const saved = await db.saveMessage(currentConversationId, 'assistant', fullAssistantResponse);
        savedMessageId = (saved as any).id ?? null;
      }

    } catch (err) {
      console.error("[ChatRoute] WS message handler error:", err);
    }
  });

  connection.socket.on("close", () => {
    console.log("[ChatRoute] WS Connection closed");
  });
}
