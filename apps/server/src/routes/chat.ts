import path from "path";
import jwt from "jsonwebtoken";
import { withSpan } from "@workspace/telemetry";
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
  CoinDCXTool,
  CoinDCXFuturesTool,
  SmcAnalysisTool,
  TelegramAlertTool,
  fetchPublicOhlcv,
} from "@workspace/tools";
import { db } from "../services/db";
import {
  marketRegistry,
  timeframeEngine,
  signalEngine,
  riskEngine,
  executionEngine,
} from "../services/engines";
import {
  UniverseTool,
  InstrumentTool,
  MultiTfContextTool,
  AnalysisSetupTool,
  SimulateOrderTool,
  PlaceOrderTool,
  PositionStateTool,
} from "@workspace/agent-tools";
import { summarizeConversation } from "../services/summarizer";
import { knowledgeEngine } from "../services/knowledgeSingleton";

const knowledge = knowledgeEngine;
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-prod';

const PUBLIC_COINDCX = 'https://public.coindcx.com';

// Crypto symbols to detect in chat mode for live data injection
const CRYPTO_SYMBOLS = ['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','DOT','AVAX','MATIC','LINK','LTC','UNI','ATOM'];
const PRICE_KEYWORDS = /\b(price|rate|worth|value|cost|ticker|market|trading at|how much|current)\b/i;
const TREND_KEYWORDS = /\b(trend|direction|bullish|bearish|moving average|MA|RSI|momentum|support|resistance|breakout|pattern|analysis|chart|signal|going up|going down|oversold|overbought)\b/i;
const FUTURES_KEYWORDS = /\b(futures|perp|perpetual|swap|contract|long|short|leverage)\b/i;

/** Map query intent to candle interval + label */
function resolveInterval(message: string): { interval: string; label: string; limit: number } {
  const m = message.toLowerCase();
  if (/\b(scalp|1m|1\s*min|one\s*min)\b/.test(m))      return { interval: '1m',  label: '1m (scalp)',      limit: 60  };
  if (/\b(5m|5\s*min|five\s*min)\b/.test(m))            return { interval: '5m',  label: '5m',              limit: 60  };
  if (/\b(15m|15\s*min|fifteen\s*min)\b/.test(m))       return { interval: '15m', label: '15m',             limit: 60  };
  if (/\b(30m|30\s*min|half\s*hour)\b/.test(m))         return { interval: '30m', label: '30m',             limit: 60  };
  if (/\b(intraday|hourly|1h|1\s*hour|one\s*hour|today|short.?term|short term)\b/.test(m)) return { interval: '1h', label: '1h (intraday)', limit: 48 };
  if (/\b(4h|4\s*hour|four\s*hour|swing)\b/.test(m))   return { interval: '4h',  label: '4h (swing)',      limit: 50  };
  if (/\b(daily|1d|day|weekly|long.?term|long term)\b/.test(m)) return { interval: '1d', label: '1d (daily)', limit: 60 };
  // default
  return { interval: '4h', label: '4h', limit: 50 };
}

function computeTrend(candles: any[]): string {
  if (candles.length < 5) return 'insufficient data';
  const closes = candles.map(c => parseFloat(c.close));
  const n = closes.length;
  const ma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, n);
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, n);
  const last = closes[n - 1];
  const first = closes[0];
  const pctChange = ((last - first) / first * 100).toFixed(2);

  // RSI-14
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const rsi = avgLoss === 0 ? 100 : Math.round(100 - (100 / (1 + avgGain / avgLoss)));

  const trendDir = ma10 > ma20 ? 'BULLISH (MA10 > MA20)' : ma10 < ma20 ? 'BEARISH (MA10 < MA20)' : 'NEUTRAL';
  const rsiLabel = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';

  return `trend=${trendDir} | change=${pctChange}% over ${n} candles | MA10=${ma10.toFixed(2)} MA20=${ma20.toFixed(2)} | RSI14=${rsi}(${rsiLabel}) | last=${last}`;
}

/** Exact-match ticker lookup: ETHUSDT before ETHFIUSDT, ETHWUSDT etc. */
function findTicker(tickers: any[], sym: string, suffix: string): any | undefined {
  const exact = `${sym}${suffix}`;
  return tickers.find(t => (t.market ?? '').toUpperCase() === exact)
    ?? tickers.find(t => {
      const m = (t.market ?? '').toUpperCase();
      return m.startsWith(sym) && m.endsWith(suffix) && m.length === exact.length;
    });
}

/**
 * Resolve base assets (BTC, ETH, …) for live CoinDCX context.
 * Uses word boundaries — `upper.includes("ADA")` must NOT match "**intrADAy**".
 */
function extractCryptoBases(message: string): string[] {
  const bases = new Set<string>();

  for (const m of message.toUpperCase().matchAll(/\b([A-Z]{2,10})USDT\b/g)) {
    bases.add(m[1]);
  }

  if (/\bETH\s+USD\b/i.test(message)) bases.add('ETH');
  if (/\bBTC\s+USD\b/i.test(message)) bases.add('BTC');

  for (const sym of CRYPTO_SYMBOLS) {
    if (new RegExp(`\\b${sym}\\b`, 'i').test(message)) bases.add(sym);
    if (new RegExp(`\\b${sym}USDT\\b`, 'i').test(message)) bases.add(sym);
  }

  const order = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'LTC', 'UNI', 'ATOM'];
  return [...bases].sort(
    (a, b) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b))
  );
}

async function fetchFuturesRtLine(pair: string): Promise<string | null> {
  try {
    const res = await fetch(`${PUBLIC_COINDCX}/market_data/v3/current_prices/futures/rt`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const row = data?.prices && typeof data.prices === 'object'
      ? (data.prices as Record<string, Record<string, unknown>>)[pair]
      : undefined;
    if (!row || typeof row !== 'object') return null;
    const mark = row.mp ?? row.mark_price;
    const last = row.ls ?? row.last_price;
    return `${pair} (CoinDCX futures RT): mark=${mark} last=${last} 24h_high=${row.h} 24h_low=${row.l} 24h_change_pct=${row.pc}%`;
  } catch {
    return null;
  }
}

async function fetchLiveCryptoContext(message: string): Promise<string> {
  const upper = message.toUpperCase();
  const mentioned = extractCryptoBases(message);
  const wantsTrend = TREND_KEYWORDS.test(message);
  const wantsFutures = FUTURES_KEYWORDS.test(message);
  if (!mentioned.length || (!PRICE_KEYWORDS.test(message) && !wantsTrend && !wantsFutures)) return '';

  const { interval, label, limit } = resolveInterval(message);

  try {
    const parts: string[] = [];
    const priceRows: string[] = [];

    // For futures/trend queries: fetch candles at detected timeframe
    if (wantsFutures || wantsTrend) {
      for (const sym of mentioned) {
        const pair = `B-${sym}_USDT`;
        try {
          const sorted = await fetchPublicOhlcv(pair, interval, limit, {
            signal: AbortSignal.timeout(5_000),
          });
          let gotTrend = false;
          if (sorted.length > 0) {
            const last = sorted[sorted.length - 1];
            priceRows.push(`${pair} (futures ${label}): last=$${last.close} high=$${last.high} low=$${last.low} vol=${last.volume}`);
            parts.push(`${sym}/USDT FUTURES TREND [${label}, ${sorted.length} bars]: ${computeTrend(sorted as any[])}`);
            gotTrend = true;
          }
          if (!gotTrend) {
            const rt = await fetchFuturesRtLine(pair);
            if (rt) priceRows.push(rt);
          }
        } catch { /* best effort */ }
      }
      if (priceRows.length || parts.length) {
        const out = [`LIVE COINDCX FUTURES (fetched now):\n${priceRows.join('\n')}`];
        if (parts.length) out.push(`\nTECHNICAL ANALYSIS:\n${parts.join('\n')}`);
        return out.join('\n');
      }
    }

    // Spot fallback: exact-match ETHUSDT not ETHFIUSDT
    const tickerRes = await fetch('https://api.coindcx.com/exchange/ticker', {
      signal: AbortSignal.timeout(5_000),
    });
    if (!tickerRes.ok) return '';
    const tickers: any[] = await tickerRes.json();

    for (const sym of mentioned) {
      const usdt = findTicker(tickers, sym, 'USDT');
      const inr  = findTicker(tickers, sym, 'INR');
      if (usdt) priceRows.push(`${usdt.market}: $${usdt.last_price} (24h: ${usdt.change_24_hour ?? 'n/a'}% | vol: ${usdt.volume} | high: ${usdt.high} | low: ${usdt.low})`);
      if (inr)  priceRows.push(`${inr.market}: ₹${inr.last_price} (24h: ${inr.change_24_hour ?? 'n/a'}%)`);

    }

    if (!priceRows.length) return '';
    // Spot path: also compute trend via futures candles when trend was requested
    const trendParts: string[] = [];
    if (wantsTrend) {
      for (const sym of mentioned) {
        const pair = `B-${sym}_USDT`;
        try {
          const sorted = await fetchPublicOhlcv(pair, interval, limit, {
            signal: AbortSignal.timeout(5_000),
          });
          if (sorted.length > 0) {
            trendParts.push(`${sym}/USDT TREND [${label}, ${sorted.length} bars]: ${computeTrend(sorted as any[])}`);
          }
        } catch { /* best effort */ }
      }
    }
    const result = [`LIVE COINDCX PRICES (fetched now):\n${priceRows.join('\n')}`];
    if (trendParts.length) result.push(`\nTECHNICAL ANALYSIS:\n${trendParts.join('\n')}`);
    return result.join('\n');
  } catch { return ''; }
}

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
  registry.register(new CoinDCXTool());
  registry.register(new CoinDCXFuturesTool());
  registry.register(new SmcAnalysisTool());
  registry.register(new TelegramAlertTool());
  // Trading architecture tools — deterministic engines, LLM orchestrates only
  registry.register(new UniverseTool(marketRegistry));
  registry.register(new InstrumentTool(marketRegistry));
  registry.register(new MultiTfContextTool(timeframeEngine));
  registry.register(new AnalysisSetupTool(signalEngine));
  registry.register(new SimulateOrderTool(signalEngine, riskEngine));
  registry.register(new PlaceOrderTool(signalEngine, riskEngine, executionEngine));
  registry.register(new PositionStateTool(executionEngine));
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
        provider,
        /** When false, only the latest user message is sent to the model (no DB thread / no client history). Default true. */
        includeConversationHistory,
        /** Plain completion: no agent, tools, RAG, or DB-backed history — client sends the full thread. */
        simpleChat,
      } = payload;
      const sendConversationHistory = includeConversationHistory !== false;
      const isSimpleChat = simpleChat === true;
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

      let history: Array<{ role: string; content: string }> = [];
      let historyContext = "";
      let contextDocs: any[] = [];
      let systemPromptText: string;

      if (isSimpleChat) {
        const base = customSystemPrompt?.trim() || "You are a helpful assistant. Respond clearly and concisely.";
        systemPromptText = base;
        if (thinking) {
          systemPromptText += `\n\nTHINKING MODE ENABLED:
You MUST reason step-by-step before providing your final answer.
Wrap your internal reasoning process entirely within <redacted_thinking>...</redacted_thinking> tags.`;
        }
      } else {
      // 1. Retrieve Knowledge (RAG) — filter out low-relevance results (cosine < 0.35)
      const MIN_RAG_SCORE = 0.35;
      const [allContextDocs, liveCryptoContext] = await Promise.all([
        knowledge.retrieve(lastUserMessage, {}, requestedProvider),
        fetchLiveCryptoContext(lastUserMessage),
      ]);
      contextDocs = allContextDocs.filter((d: any) => (d.score ?? d.vectorScore ?? 0) >= MIN_RAG_SCORE);
      const availableFiles = knowledge.listAll();
      const contextString = contextDocs.map((d: any) => `FILE: ${d.path}\nCONTENT: ${d.content}`).join("\n\n");

      // 2. Prepare Context (History) — use cached summary, re-summarize only every 5 new messages
      if (sendConversationHistory) {
        const rows = await db.getMessages(currentConversationId);
        history = rows.map((m: any) => ({ role: m.role, content: m.content }));
        if (history.length > 10) {
          const cached = await db.getSummary(currentConversationId);
          const needsRefresh = !cached || history.length >= cached.messageCount + 5;
          if (needsRefresh) {
            const historyText = history.map((m) => `${m.role}: ${m.content}`).join("\n");
            const summary = await summarizeConversation(historyText, requestedModel, requestedProvider);
            await db.upsertSummary(currentConversationId, summary, history.length, {
              title: conversationTitle,
              model: requestedModel,
              userId,
            });
            historyContext = `Conversation Summary:\n${summary}`;
          } else {
            historyContext = `Conversation Summary:\n${cached.summary}`;
          }
        }
      }

      // 3. Prepare System Prompt (chat mode)
      const basePrompt = customSystemPrompt?.trim() ? customSystemPrompt : "You are a local AI assistant.";
      systemPromptText = `${basePrompt}
Use the following context if relevant to the question.
If not found in context, answer normally.

AVAILABLE LOCAL FILES:
${availableFiles.join(", ") || "No local files indexed."}

${sendConversationHistory ? historyContext : ''}

CONTEXT FROM DOCUMENTS:
${contextString || "No specific content match found in local knowledge."}
${liveCryptoContext ? `\n${liveCryptoContext}` : ''}

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
Wrap your internal reasoning process entirely within <redacted_thinking>...</redacted_thinking> tags.`;
      }

      // ── Strategic Mode Overrides ──
      if (lastUserMessage.includes("[STRATEGY_MODE: SMC]")) {
        systemPromptText += `\n\nSTRATEGY DIRECTIVE: SMC ANALYSIS MODE
- Priorities: Market Structure (BoS/ChoCh), Order Blocks, and Fair Value Gaps.
- Mandatory: Call 'smc_analysis' **once** when you need SMC context (same symbol/timeframes/params). After a successful result, your **next** step must be **finish** (or a different tool/args if the task requires it) — never repeat smc_analysis with identical parameters on the next turn.
- Determinism: Follow the "Lookup-on-Error" protocol strictly if symbols mismatch.
- Alerts: If a high-confidence setup is found, you MUST use the 'telegram_alert' tool to notify the user.`;
      } else if (lastUserMessage.includes("[STRATEGY_MODE: TREND]")) {
        systemPromptText += `\n\nSTRATEGY DIRECTIVE: TREND/SENTIMENT MODE
- Priorities: Multi-timeframe trend analysis and volume profile.
- Mandatory: Fetch live CoinDCX futures data before making a judgment.`;
      } else if (lastUserMessage.includes("[STRATEGY_MODE: LIQUIDITY]")) {
        systemPromptText += `\n\nSTRATEGY DIRECTIVE: LIQUIDITY AUDIT MODE
- Priorities: Liquidity sweeps, inducement, and internal/external range pools.`;
      }
      }

      const systemPromptMsg = { role: 'system', content: systemPromptText };
      const finalMessages = isSimpleChat
        ? [systemPromptMsg, ...messages]
        : sendConversationHistory
          ? [systemPromptMsg, ...messages]
          : [systemPromptMsg, { role: 'user' as const, content: lastUserMessage }];

      // 4. Persist user message
      await db.saveMessage(currentConversationId, 'user', lastUserMessage);

      connection.socket.send(JSON.stringify({
        type: 'sources',
        sources: contextDocs.map((d: any) => d.path),
        conversation_id: currentConversationId
      }));

      let fullAssistantResponse = "";
      let savedMessageId: string | null = null;

      if (agentMode && !isSimpleChat) {
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
          await withSpan('chat', 'agent.run', () => runtime.run(
            lastUserMessage,
            sendConversationHistory ? history : [],
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
                
                // Also broadcast the tool data as a step update so the UI can show exact data used
                connection.socket.send(JSON.stringify({
                  type: 'agent_step',
                  step: {
                    id: p.id || `tool-${Date.now()}`,
                    label: `Executed ${p.tool}`,
                    tool: p.tool,
                    status: 'success',
                    input: JSON.stringify(p.args),
                    output: JSON.stringify(p.result),
                    duration: p.duration,
                    timestamp: Date.now()
                  },
                  conversation_id: currentConversationId
                }));

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
          ));
        } finally {
          connection.socket.off('message', approvalListener);
        }

      } else {
        // ── Chat mode: streaming path ──
        let buffer = "";
        let stepsEmitted = new Set<string>();
        const startTime = Date.now();

        const emitStep = (id: string, label: string, status: 'running' | 'success', tool?: string) => {
          if (isSimpleChat) return;
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
          await withSpan('chat', 'ollama.stream', () => ollama.stream(
            requestedModel,
            finalMessages,
            (token) => {
              fullAssistantResponse += token;
              buffer += token;

              connection.socket.send(JSON.stringify({ type: 'token', token, conversation_id: currentConversationId }));

              if (buffer.includes("<redacted_thinking>") && !stepsEmitted.has('thinking')) {
                emitStep('thinking', 'Reasoning step-by-step', 'running');
              }
              if (buffer.includes("</redacted_thinking>") && !stepsEmitted.has('thinking-done')) {
                emitStep('thinking', 'Reasoning complete', 'success');
                stepsEmitted.add('thinking-done');
              }

              if (!isSimpleChat && buffer.includes("<tool>edit_file</tool>")) {
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
          ));

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
