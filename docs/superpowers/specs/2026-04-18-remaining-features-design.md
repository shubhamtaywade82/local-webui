# Remaining Features Design
**Date:** 2026-04-18
**Stack:** React + Vite + Fastify + PostgreSQL + Ollama (Node/TypeScript monorepo)
**Approach:** Phase-gated — each phase ships and merges independently before next begins

---

## Context

Gap analysis against the architectural blueprint (`Building AI Chat, Agent, Coding UI.txt`). ~50–60% of the spec was implemented. This document covers the remaining ~40–50%.

---

## Phase 1 — Core DB + Agent Foundation

### New DB Models (Sequelize, auto-synced)

```typescript
Artifact {
  id: uuid
  conversationId: string (FK → Conversation)
  userId: string (FK → User, added Phase 2)
  fileType: string
  rawContent: text
  filePath: string
  createdAt: Date
}

AgentExecution {
  id: uuid
  messageId: string (FK → Message)
  toolName: string
  toolInput: jsonb
  toolOutput: jsonb
  durationMs: number
  status: 'success' | 'error' | 'timeout'
  createdAt: Date
}
```

### `packages/agent-runtime/` — ReAct Loop

Replaces current stub. Implements Reason → Act → Observe loop:

1. Build system prompt with tool schemas + conversation history
2. Call Ollama → parse JSON tool call from response
3. Execute named tool, capture output string
4. Append `[tool: X] → [result: Y]` to context window
5. Loop to step 2
6. On `finish` tool call or max iterations reached → stream final answer tokens to client

**Configuration:**
- `maxIterations`: default 10, configurable per-request and via settings UI
- `mode`: `auto` (loop runs fully unattended) | `step` (emits `agent_step_pending` WebSocket event, waits for `approve` message from client before each iteration)

**Loop control:**
- Each iteration writes one `AgentExecution` row
- On error: emit `agent_step` event with `status: error`, break loop, stream error message
- Infinite loop protection: hard cap at `maxIterations`, emit warning on hit

### `packages/tools/` — Tool Registry

Each tool: named class implementing `execute(input: Record<string, unknown>): Promise<string>`.

| Tool | Input | Description |
|------|-------|-------------|
| `read_file` | `{ path }` | Read file content from workspace |
| `list_files` | `{ path }` | List files/dirs in path |
| `edit_file` | `{ path, content }` | Overwrite file content |
| `create_file` | `{ path, content }` | Create new file |
| `delete_file` | `{ path, confirm: true }` | Delete file (requires explicit confirm flag) |
| `query_database` | `{ sql }` | SELECT-only SQL in `agent_sandbox` schema |
| `describe_schema` | `{}` | Return tables/columns in `agent_sandbox` |
| `search_kb` | `{ query }` | Call `KnowledgeEngine.retrieve(query)` |
| `ingest_document` | `{ path }` | Add doc to KB + trigger ingestion |
| `run_code` | `{ language, code }` | Execute in Docker (network-blocked, 30s timeout) |
| `web_search` | `{ query }` | **STUB** — returns `"not implemented"` |
| `fetch_url` | `{ url }` | **STUB** — returns `"not implemented"` |
| `finish` | `{ answer }` | Signal loop completion, set final answer |

**`run_code` Docker sandbox:**
- Spins up `node:alpine` or `python:3.12-alpine` container per call
- Mounts code as temp file, `--network none`, `--memory 256m`, `--cpus 0.5`
- 30s timeout, container killed + removed after
- Returns stdout (max 10KB) or stderr on failure

### Chat Route Changes (`apps/server/src/routes/chat.ts`)

- Add `agentMode: boolean` field to request body
- If `agentMode: true`: hand off to `agent_runtime.run()` which streams `agent_step` + `tool_call` + `token` WS events
- If `agentMode: false` (default): existing path unchanged, no regression
- Agent mode detectable via explicit toggle only (no heuristic auto-detection)

---

## Phase 2 — Security + Isolation

### DB Scoped Schema + RBAC

One-time migration script `scripts/setup-agent-sandbox.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS agent_sandbox;
CREATE ROLE agent_sandbox_role NOLOGIN;
GRANT USAGE ON SCHEMA agent_sandbox TO agent_sandbox_role;
GRANT SELECT, INSERT, UPDATE, CREATE ON ALL TABLES IN SCHEMA agent_sandbox TO agent_sandbox_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA agent_sandbox 
  GRANT SELECT, INSERT, UPDATE ON TABLES TO agent_sandbox_role;
REVOKE ALL ON SCHEMA public FROM agent_sandbox_role;

-- Login user that carries the restricted role (NOLOGIN roles cannot connect directly)
CREATE USER agent_sandbox_user WITH PASSWORD :'AGENT_SANDBOX_PASSWORD';
GRANT agent_sandbox_role TO agent_sandbox_user;
```

Run with: `psql -v AGENT_SANDBOX_PASSWORD="<secret>" -f scripts/setup-agent-sandbox.sql $DATABASE_URL`

`query_database` tool uses a **second Sequelize pool** (`agentPool`) connecting as `agent_sandbox_user`:
- `search_path = agent_sandbox`
- Connection string: `AGENT_SANDBOX_DB_URL` env var (defaults to `DATABASE_URL` with user swapped to `agent_sandbox_user`)
- SQL validated: reject anything containing `DROP`, `TRUNCATE`, `DELETE`, `UPDATE` at application layer before execution (belt-and-suspenders on top of RBAC)

`describe_schema` introspects `information_schema.columns WHERE table_schema = 'agent_sandbox'` only.

### Full Multi-User Auth

**New package `packages/auth/`:**
- `hashPassword(plain)` → bcrypt hash (cost 12)
- `verifyPassword(plain, hash)` → boolean
- `signToken(userId)` → JWT (HS256, 7-day expiry, secret from `JWT_SECRET` env)
- `verifyToken(token)` → `{ userId }` or throw

**New DB model:**
```typescript
User {
  id: uuid
  email: string (unique)
  passwordHash: string
  createdAt: Date
}
```

All existing models (`Conversation`, `Artifact`, `AgentExecution`) get `userId` FK. Sequelize scopes enforce per-user isolation on all queries.

**New routes `apps/server/src/routes/auth.ts`:**
- `POST /auth/register` — `{ email, password }` → creates User, returns `{ token, user }`
- `POST /auth/login` — `{ email, password }` → verifies, returns `{ token, user }`
- `GET /auth/me` — returns current user (requires auth)

**Middleware `apps/server/src/middleware/authenticate.ts`:**
- Extracts `Authorization: Bearer <token>` from header or `token` query param (for WebSocket upgrade)
- Decodes token → attaches `req.user = { id, email }` to request
- Applied to all routes except `POST /auth/*` and `GET /health`
- 401 on missing/invalid token

**Frontend:**
- New `LoginPage` + `RegisterPage` components (minimal, form + submit)
- `useAuthStore` (Zustand, localStorage-persisted) — stores `{ token, user }`, exposes `login`, `register`, `logout`
- All API calls (fetch + WebSocket) attach `Authorization: Bearer <token>` header
- `ProtectedRoute` wrapper — redirects to `/login` if no valid token
- Logout button in `Sidebar`

**New env var:** `JWT_SECRET` (required, no default — server throws on start if missing)

---

## Phase 3 — Observability

### `AgentExecutionLog` DB Table

```typescript
AgentExecutionLog {
  id: uuid
  userId: string (FK → User)
  conversationId: string (FK → Conversation)
  messageId: string (FK → Message)
  rawPrompt: text
  rawResponse: text
  toolName: string | null
  toolInput: jsonb | null
  toolOutput: jsonb | null
  durationMs: number
  tokenCount: number | null
  status: 'success' | 'error' | 'timeout'
  errorMessage: string | null
  createdAt: Date
}
```

Every `agent_runtime` loop iteration writes one row. Queryable for prompt tuning and debugging.

### `packages/telemetry/` — OpenTelemetry

Wraps `@opentelemetry/sdk-node` + `@opentelemetry/exporter-otlp-http`:

- `initTelemetry(serviceName)` — called once on server start, exports to Jaeger via OTLP HTTP at `OTEL_EXPORTER_ENDPOINT` (default `http://localhost:4318`)
- `traceAgentRun(conversationId, fn)` — root span wrapping full `agent_runtime.run()` call
- `traceToolCall(toolName, input, fn)` — child span per tool, records `tool.name`, `tool.input_size`, `tool.duration_ms`
- `traceOllamaCall(model, fn)` — child span per Ollama API call, records `llm.model`, `llm.duration_ms`

Both `AgentExecutionLog` rows and OTEL spans are written on every iteration — DB for persistence/querying, OTEL for live visual tracing.

### Jaeger via Docker Compose

New `docker-compose.yml` at repo root (opt-in, not required for dev):

```yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"   # Jaeger UI
      - "4318:4318"     # OTLP HTTP receiver
```

Jaeger UI at `http://localhost:16686`.

**New env var:** `OTEL_EXPORTER_ENDPOINT` (default `http://localhost:4318`, optional — telemetry disabled if Jaeger not running, no crash)

### Persistent Summarization

`Conversation` model gets two new columns:
- `summary: text | null` — stored summary text
- `summarizedUpToId: string | null` — FK to last `Message` included in summary

On each chat request:
1. Fetch messages since `summarizedUpToId` (or all if null)
2. If `newMessages.length > 10`: summarize only the delta, prepend stored `summary`, write back
3. If ≤ 10 new messages since last summary: use stored summary as-is, no Ollama call
4. Build system prompt using stored summary + recent messages (last 10)

Result: summarization Ollama call only fires when genuinely needed, not on every request.

---

## Phase 4 — Frontend Polish

### Shiki Syntax Highlighting

Replace `react-syntax-highlighter` in `MarkdownRenderer.tsx`:

- `createHighlighter({ themes: ['github-dark', 'github-light'], langs: [...] })` called once on component mount, stored in `useRef`
- While highlighter loading: render `<pre><code className="language-X">` fallback (no layout shift)
- Once ready: Shiki renders to HTML string → sanitized via DOMPurify → injected via `dangerouslySetInnerHTML`
- Theme follows existing dark/light mode state from `useChatStore`
- Languages loaded on demand (Shiki tree-shakes unused grammars)

### SQL Results Panel

**`SqlResultsPanel.tsx`** — new component in `apps/web/src/components/sql/`:

```
┌─────────────────────────────────────┐
│ SQL Results              [clear] [x]│
├─────────────────────────────────────┤
│ ▼ SELECT * FROM orders LIMIT 10     │
│   42 rows · 213ms · 2m ago  [CSV ↓] │
├─────────────────────────────────────┤
│ id │ user_id │ amount │ status      │
│  1 │ 3       │ 99.00  │ paid        │
│  2 │ 7       │ 14.50  │ pending     │
│ ...                                 │
└─────────────────────────────────────┘
```

- Receives `tool_call` WebSocket events where `tool === "query_database"`
- Results stored in `useSqlResultsStore` (Zustand): `Array<{ id, query, columns, rows, durationMs, timestamp }>`
- Multiple results stacked, newest on top, each collapsible
- Panel auto-opens on first SQL result
- Export CSV button per result set
- Clear all button

**`WorkspaceLayout.tsx`** — add 5th panel slot between ResearchPanel and CodeEditorPanel, collapsible with same drag-resize pattern as existing panels.

### Settings Additions

New controls in `SettingsModal.tsx`:
- **Agent mode**: `Auto` / `Step-by-step` toggle (maps to `agent_runtime` `mode` field)
- **Max iterations**: number input 1–50, default 10
- **Shiki theme**: dropdown (github-dark / github-light / tokyo-night / dracula)

---

## Cross-Cutting Concerns

### WebSocket Protocol Extensions

New message types added to existing WS protocol (no breaking changes to existing types):

| Type | Direction | Payload |
|------|-----------|---------|
| `agent_step_pending` | server → client | `{ stepId, toolName, toolInput }` |
| `agent_step_approve` | client → server | `{ stepId }` |
| `agent_step_reject` | client → server | `{ stepId, reason? }` |
| `sql_result` | server → client | `{ query, columns, rows, durationMs }` |

### New Env Vars

| Variable | Default | Required |
|----------|---------|----------|
| `JWT_SECRET` | — | Yes (Phase 2+) |
| `AGENT_SANDBOX_DB_URL` | `DATABASE_URL` with user=agent_sandbox_user | No |
| `AGENT_SANDBOX_PASSWORD` | — | Yes (used in setup script) |
| `OTEL_EXPORTER_ENDPOINT` | `http://localhost:4318` | No |
| `DOCKER_HOST` | system default | No |

### Build Order Within Each Phase

Each phase follows: DB schema → backend service/package → route changes → frontend store → frontend UI.

---

## Out of Scope

- `web_search` and `fetch_url` tools: stubbed, return `"not implemented"`. Placeholder schema included so agent runtime can reference them without error.
- GraphRAG / Apache AGE extensions
- Kamal deployment configuration
- Mobile/PWA support
