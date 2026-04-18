# Phase 3: Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured DB telemetry (`AgentExecutionLog`), OpenTelemetry tracing exported to Jaeger, and persistent conversation summarization that avoids redundant Ollama calls.

**Architecture:** A new `packages/telemetry/` package wraps `@opentelemetry/sdk-node` and exports `initTelemetry`, `traceAgentRun`, `traceToolCall`, and `traceOllamaCall` helpers. Jaeger runs via Docker Compose. Every `AgentRuntime` loop iteration writes one `AgentExecutionLog` row and a child OTel span. Summarization writes back to `Conversation.summary` and `summarizedUpToId` columns, avoiding re-summarization on subsequent requests.

**Tech Stack:** `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/instrumentation-http`, Docker Compose (Jaeger), Sequelize (2 new columns on Conversation).

**Prerequisites:** Phase 2 complete and merged.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/telemetry/index.ts` | `initTelemetry`, `traceAgentRun`, `traceToolCall`, `traceOllamaCall` |
| Create | `packages/telemetry/package.json` | OTel deps |
| Create | `packages/telemetry/tests/telemetry.test.ts` | Verify spans are created, no crash when Jaeger offline |
| Modify | `apps/server/src/services/db.ts` | Add `AgentExecutionLog` model + `summary`/`summarizedUpToId` to Conversation |
| Modify | `apps/server/src/server.ts` | Call `initTelemetry()` on startup |
| Modify | `apps/server/src/routes/chat.ts` | Wrap agent run + Ollama stream in OTel spans; write AgentExecutionLog rows |
| Modify | `apps/server/src/services/summarizer.ts` | Use persistent summary columns instead of always re-summarizing |
| Create | `docker-compose.yml` | Jaeger all-in-one service |

---

## Task 1: docker-compose.yml with Jaeger

**Files:**
- Create: `docker-compose.yml` (repo root)

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
version: "3.9"

services:
  jaeger:
    image: jaegertracing/all-in-one:1.57
    container_name: jaeger
    ports:
      - "16686:16686"   # Jaeger UI
      - "4318:4318"     # OTLP HTTP receiver
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    restart: unless-stopped
```

- [ ] **Step 2: Start Jaeger**

```bash
docker compose up -d jaeger
```

Expected: Jaeger UI at `http://localhost:16686` loads successfully.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker-compose.yml with Jaeger for OTel trace visualization"
```

---

## Task 2: Telemetry package

**Files:**
- Create: `packages/telemetry/package.json`
- Create: `packages/telemetry/index.ts`
- Create: `packages/telemetry/tests/telemetry.test.ts`

- [ ] **Step 1: Create `packages/telemetry/package.json`**

```json
{
  "name": "@workspace/telemetry",
  "version": "1.0.0",
  "main": "index.ts",
  "types": "index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.8.0",
    "@opentelemetry/sdk-node": "^0.51.1",
    "@opentelemetry/exporter-trace-otlp-http": "^0.51.1",
    "@opentelemetry/resources": "^1.24.1",
    "@opentelemetry/semantic-conventions": "^1.24.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

- [ ] **Step 3: Write failing tests**

Create `packages/telemetry/tests/telemetry.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('telemetry', () => {
  it('initTelemetry does not throw when OTEL endpoint is unreachable', async () => {
    process.env.OTEL_EXPORTER_ENDPOINT = 'http://localhost:19999'; // unreachable port
    const { initTelemetry } = await import('../index');
    expect(() => initTelemetry('test-service')).not.toThrow();
  });

  it('traceToolCall wraps async fn and returns result', async () => {
    const { traceToolCall } = await import('../index');
    const result = await traceToolCall('test_tool', { input: 'x' }, async () => 'tool output');
    expect(result).toBe('tool output');
  });

  it('traceAgentRun wraps async fn and returns result', async () => {
    const { traceAgentRun } = await import('../index');
    const result = await traceAgentRun('conv-123', async () => 'agent done');
    expect(result).toBe('agent done');
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
cd packages/telemetry && pnpm test
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `packages/telemetry/index.ts`**

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode, context, Tracer } from '@opentelemetry/api';

let tracer: Tracer | null = null;

export function initTelemetry(serviceName: string): void {
  const endpoint = process.env.OTEL_EXPORTER_ENDPOINT || 'http://localhost:4318';

  try {
    const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

    const sdk = new NodeSDK({
      resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName }),
      traceExporter: exporter,
    });

    sdk.start();
    tracer = trace.getTracer(serviceName);
    console.log(`[Telemetry] OTel initialized. Exporting to ${endpoint}`);
  } catch (e) {
    console.warn(`[Telemetry] Failed to initialize OTel (continuing without tracing): ${(e as Error).message}`);
  }
}

export async function traceAgentRun<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  if (!tracer) return fn();
  const span = tracer.startSpan('agent.run', { attributes: { 'conversation.id': conversationId } });
  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (e) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
    throw e;
  } finally {
    span.end();
  }
}

export async function traceToolCall<T>(
  toolName: string,
  toolInput: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  if (!tracer) return fn();
  const span = tracer.startSpan(`tool.${toolName}`, {
    attributes: {
      'tool.name': toolName,
      'tool.input_size': JSON.stringify(toolInput).length,
    }
  });
  const start = Date.now();
  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setAttribute('tool.duration_ms', Date.now() - start);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (e) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
    throw e;
  } finally {
    span.end();
  }
}

export async function traceOllamaCall<T>(model: string, fn: () => Promise<T>): Promise<T> {
  if (!tracer) return fn();
  const span = tracer.startSpan('llm.ollama', { attributes: { 'llm.model': model } });
  const start = Date.now();
  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setAttribute('llm.duration_ms', Date.now() - start);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (e) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
    throw e;
  } finally {
    span.end();
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd packages/telemetry && pnpm test
```

Expected: PASS — 3 tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/telemetry/
git commit -m "feat: add telemetry package with OTel tracing (graceful degradation when Jaeger offline)"
```

---

## Task 3: AgentExecutionLog DB model

**Files:**
- Modify: `apps/server/src/services/db.ts`

- [ ] **Step 1: Add `AgentExecutionLog` model in `apps/server/src/services/db.ts`**

Add after the `AgentExecution` model:

```typescript
class AgentExecutionLog extends Model {
  declare id: string;
  declare userId: string | null;
  declare conversationId: string;
  declare messageId: string | null;
  declare rawPrompt: string;
  declare rawResponse: string;
  declare toolName: string | null;
  declare toolInput: Record<string, unknown> | null;
  declare toolOutput: Record<string, unknown> | null;
  declare durationMs: number;
  declare tokenCount: number | null;
  declare status: 'success' | 'error' | 'timeout';
  declare errorMessage: string | null;
  declare createdAt: Date;
}

AgentExecutionLog.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  userId: { type: DataTypes.UUID, allowNull: true },
  conversationId: { type: DataTypes.UUID, allowNull: false },
  messageId: { type: DataTypes.UUID, allowNull: true },
  rawPrompt: DataTypes.TEXT,
  rawResponse: DataTypes.TEXT,
  toolName: { type: DataTypes.TEXT, allowNull: true },
  toolInput: { type: DataTypes.JSONB, allowNull: true },
  toolOutput: { type: DataTypes.JSONB, allowNull: true },
  durationMs: DataTypes.INTEGER,
  tokenCount: { type: DataTypes.INTEGER, allowNull: true },
  status: DataTypes.TEXT,
  errorMessage: { type: DataTypes.TEXT, allowNull: true },
}, {
  sequelize,
  modelName: 'agent_execution_log',
  underscored: true,
  updatedAt: false,
});
```

Add to the `db` export object:

```typescript
async saveAgentExecutionLog(data: {
  userId?: string;
  conversationId: string;
  messageId?: string;
  rawPrompt: string;
  rawResponse: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  durationMs: number;
  tokenCount?: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
}) {
  return AgentExecutionLog.create({
    ...data,
    userId: data.userId ?? null,
    messageId: data.messageId ?? null,
    toolName: data.toolName ?? null,
    toolInput: data.toolInput ?? null,
    toolOutput: data.toolOutput ?? null,
    tokenCount: data.tokenCount ?? null,
    errorMessage: data.errorMessage ?? null,
  });
},

async getAgentExecutionLogs(conversationId: string, limit = 100) {
  return AgentExecutionLog.findAll({
    where: { conversationId },
    order: [['createdAt', 'DESC']],
    limit
  });
},
```

- [ ] **Step 2: Verify table created**

```bash
pnpm dev
```

```bash
psql $DATABASE_URL -c "\dt agent_execution_logs"
```

Expected: table `agent_execution_logs` present.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/db.ts
git commit -m "feat: add AgentExecutionLog DB model for structured agent telemetry"
```

---

## Task 4: Persistent summarization

**Files:**
- Modify: `apps/server/src/services/db.ts`
- Modify: `apps/server/src/services/summarizer.ts`
- Modify: `apps/server/src/routes/chat.ts`

- [ ] **Step 1: Add summary columns to Conversation model in `apps/server/src/services/db.ts`**

In `Conversation.init`, add to the fields object:
```typescript
summary: { type: DataTypes.TEXT, allowNull: true },
summarizedUpToId: { type: DataTypes.UUID, allowNull: true },
```

Add type declarations at the top of the Conversation class:
```typescript
declare summary: string | null;
declare summarizedUpToId: string | null;
```

Add DB methods:
```typescript
async getConversationSummary(conversationId: string): Promise<{ summary: string | null; summarizedUpToId: string | null }> {
  const conv = await Conversation.findOne({
    where: { id: conversationId },
    attributes: ['summary', 'summarizedUpToId']
  });
  return { summary: (conv as any)?.summary ?? null, summarizedUpToId: (conv as any)?.summarizedUpToId ?? null };
},

async updateConversationSummary(conversationId: string, summary: string, summarizedUpToId: string) {
  await Conversation.update({ summary, summarizedUpToId }, { where: { id: conversationId } });
},
```

- [ ] **Step 2: Update `apps/server/src/services/summarizer.ts`**

Replace the current file with:

```typescript
import { OllamaClient } from '@workspace/ollama-client';
import { db } from './db';

const ollama = new OllamaClient();

export async function getOrBuildSummary(conversationId: string): Promise<string> {
  const messages = await db.getMessages(conversationId);
  if (messages.length <= 10) return ''; // No summary needed

  const { summary: stored, summarizedUpToId } = await db.getConversationSummary(conversationId);

  // Find messages after the last summarized one
  const lastIdx = summarizedUpToId
    ? messages.findIndex((m: any) => m.id === summarizedUpToId)
    : -1;
  const newMessages = messages.slice(lastIdx + 1);

  if (newMessages.length <= 5 && stored) {
    // Not enough new messages to warrant re-summarization
    return `Conversation Summary:\n${stored}`;
  }

  // Build delta summary
  const deltaText = newMessages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
  const prompt = stored
    ? `Previous summary:\n${stored}\n\nNew messages:\n${deltaText}\n\nUpdate the summary to include the new messages. Be concise.`
    : `Summarize this conversation:\n${deltaText}\n\nBe concise.`;

  try {
    const result = await ollama.chat('qwen2.5:0.5b', [
      { role: 'user', content: prompt }
    ]);
    const newSummary = result.message?.content?.trim() || stored || '';

    // Persist the updated summary
    const lastMessage = messages[messages.length - 1] as any;
    await db.updateConversationSummary(conversationId, newSummary, lastMessage.id);

    return `Conversation Summary:\n${newSummary}`;
  } catch {
    return stored ? `Conversation Summary:\n${stored}` : '';
  }
}
```

- [ ] **Step 3: Update `apps/server/src/routes/chat.ts` to use persistent summarization**

Find the current summarization block:
```typescript
if (history.length > 10) {
  const historyText = history.map((m: any) => `${m.role}: ${m.content}`).join("\n");
  const summary = await summarizeConversation(historyText);
  historyContext = `Conversation Summary:\n${summary}`;
}
```

Replace with:
```typescript
import { getOrBuildSummary } from '../services/summarizer';

// (replace the import at the top of the file too)
// Old: import { summarizeConversation } from '../services/summarizer';
// New: import { getOrBuildSummary } from '../services/summarizer';

// And replace the block:
if (history.length > 10) {
  historyContext = await getOrBuildSummary(currentConversationId);
}
```

- [ ] **Step 4: Verify summarization works**

Start a conversation with >10 messages. On the 11th message, check server logs — should see one Ollama call for summarization. On the 12th message (with no new messages since last summary threshold), should NOT see a new summarization Ollama call.

```bash
pnpm dev
# Send 12+ messages in the UI, watch server logs
```

Expected: `[Summarizer]` log appears once, then not again until 5+ new messages accumulate.

Add a log line to `getOrBuildSummary` temporarily to verify:
```typescript
console.log(`[Summarizer] Regenerating summary for conversation ${conversationId}`);
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/db.ts apps/server/src/services/summarizer.ts apps/server/src/routes/chat.ts
git commit -m "feat: persistent conversation summarization - only re-summarizes on 5+ new messages since last checkpoint"
```

---

## Task 5: Wire telemetry into server and chat route

**Files:**
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/routes/chat.ts`

- [ ] **Step 1: Add `@workspace/telemetry` dep to server**

Add to `apps/server/package.json`:
```json
"@workspace/telemetry": "workspace:*"
```

Run:
```bash
pnpm install
```

- [ ] **Step 2: Init telemetry on server startup in `apps/server/src/server.ts`**

Add import at the top:
```typescript
import { initTelemetry } from '@workspace/telemetry';
```

Call before the server starts (before `app.listen`):
```typescript
initTelemetry('local-webui-server');
```

- [ ] **Step 3: Wrap agent run in OTel span in `apps/server/src/routes/chat.ts`**

Add import:
```typescript
import { traceAgentRun, traceToolCall, traceOllamaCall } from '@workspace/telemetry';
```

Wrap the `runtime.run(...)` call:
```typescript
await traceAgentRun(currentConversationId, () =>
  runtime.run(lastUserMessage, history.map(...), (event) => {
    // ... existing event handler unchanged ...
  }, agentConfig.mode === 'step' ? onApproval : undefined)
);
```

Wrap the non-agent `ollama.stream(...)` call:
```typescript
await traceOllamaCall(model || 'qwen2.5:0.5b', () =>
  ollama.stream(model || 'qwen2.5:0.5b', finalMessages, (token) => {
    // ... existing token handler unchanged ...
  })
);
```

- [ ] **Step 4: Write AgentExecutionLog rows in the `tool_call` event handler**

In the `tool_call` event handler inside the agent run, after `db.saveAgentExecution(...)`, add:

```typescript
db.saveAgentExecutionLog({
  userId: (req as any).user?.userId,
  conversationId: currentConversationId,
  messageId: savedMessageId ?? undefined,
  rawPrompt: lastUserMessage,
  rawResponse: p.result,
  toolName: p.tool,
  toolInput: p.args,
  toolOutput: { result: p.result },
  durationMs: p.duration,
  status: 'success',
}).catch(() => {}); // Non-blocking
```

- [ ] **Step 5: Verify traces in Jaeger**

```bash
pnpm dev
```

Open `http://localhost:5173`, enable Agent Mode, send a message that triggers tool use.

Open `http://localhost:16686`. Search for service `local-webui-server`. Expected: traces appear showing `agent.run` as root span with `tool.*` child spans.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/server.ts apps/server/src/routes/chat.ts apps/server/package.json
git commit -m "feat: wire OTel spans into agent run and Ollama calls, write AgentExecutionLog on tool_call"
```

---

## Task 6: Run Phase 3 tests

- [ ] **Step 1: Run telemetry package tests**

```bash
cd packages/telemetry && pnpm test
```

Expected: PASS — 3 tests green.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: agent-runtime, tools, auth, telemetry all pass.

- [ ] **Step 3: Verify DB rows exist after agent run**

```bash
psql $DATABASE_URL -c "SELECT tool_name, status, duration_ms FROM agent_execution_logs ORDER BY created_at DESC LIMIT 5;"
```

Expected: rows appear after agent mode chat messages.

- [ ] **Step 4: Tag Phase 3 complete**

```bash
git tag phase3-complete
```
