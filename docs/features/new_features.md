# local-webui Feature Overview

This document describes implemented features in this repository (`local-webui`) and where each feature lives in code.

## Product Summary

`local-webui` is a pnpm monorepo with:

- `apps/web`: React + Vite single-page app.
- `apps/server`: Fastify API + WebSocket streaming.
- `packages/*`: shared tool, market, execution, and agent runtime packages.
- `knowledge/`: markdown corpus used for RAG retrieval.

The system is local-first and can run with local Ollama or cloud provider mode.

## Core Features

### 1) Chat Streaming with RAG Context

- Web client streams assistant output over WebSocket (`/chat`).
- Server injects document retrieval, optional conversation summaries, and optional live CoinDCX market context.
- Streaming events include tokens, steps, and source metadata.

Primary files:

- `apps/server/src/routes/chat.ts`
- `apps/web/src/stores/useChatStore.tsx`
- `packages/knowledge-engine/*`

### 2) Two Chat Modes

- `simpleChat`: plain completion-style chat.
- Non-simple mode: richer prompt + retrieval + optional tool integration.
- Completion-style models are routed through generate-specific path.

### 3) Optional Agent Runtime Loop

- `agentMode` enables `AgentRuntime` tool-loop execution.
- Runtime validates tool JSON contract and guards duplicate immediate calls.
- Emits step lifecycle events for UI rendering.

Primary files:

- `packages/agent-runtime/runtime.ts`
- `apps/server/src/routes/chat.ts`

### 4) Workspace File Tools

- Read/list/edit/create/delete tools for text files.
- Raster image edits are blocked via file tool path checks.
- Image-generation requests are redirected to ComfyUI workflow guidance.

Primary files:

- `packages/tools/file-tools.ts`
- `apps/server/src/routes/chat.ts`

### 5) Knowledge Retrieval (RAG)

- Markdown corpus retrieval from `knowledge/` (or env override).
- Optional Postgres-backed retrieval path with fallback behavior.
- Ingestion script available for loading chunks into DB.

Primary files:

- `packages/knowledge-engine/*`
- `scripts/ingest.ts`

### 6) CoinDCX Market and Trading Tooling

- Public futures endpoints: RT prices, instruments, orderbook, OHLCV, trades.
- Shared market stream pushes pulse updates to web dashboard.
- Authenticated futures actions available through guarded tools.

Primary files:

- `apps/server/src/routes/trading.ts`
- `apps/server/src/routes/market.ts`
- `apps/server/src/services/marketStream.ts`
- `packages/tools/coindcx-tool.ts`
- `packages/tools/coindcx-futures-tool.ts`

### 7) Futures Automation Pipeline

- Optional automation loop for level-cross + SMC + Telegram alerts.
- Uses RT polling by default, optional native websocket transport.

Primary files:

- `apps/server/src/services/futuresAutomation.ts`
- `packages/tools/smc-engine.ts`
- `packages/tools/smc-analysis-tool.ts`

### 8) Trading Safety Guards

Live order creation is gated.

- `PLACE_ORDER` defaults to disabled.
- Only truthy values (`true`, `1`, `yes`, `on`) enable create-order paths.
- Guard applies in both execution-engine flow and futures tool flow.

Primary files:

- `packages/coindcx-client/placeOrderPolicy.ts`
- `packages/execution-engine/guards.ts`
- `packages/execution-engine/engine.ts`
- `packages/tools/coindcx-futures-tool.ts`

### 9) Private CoinDCX Stream Join

- Server market stream auto-joins private `coindcx` channel when API keys are set.
- Can be disabled explicitly using `COINDCX_PRIVATE_STREAM=0|false|no|off`.

Primary files:

- `apps/server/src/services/marketStream.ts`
- `packages/coindcx-client/stream/privateJoin.ts`

## Frontend Feature Surfaces

- Chat streaming UI with status/steps.
- Trading dashboard with market pulse, orderbook, candles, and trades.
- ComfyUI page integration and server-side health probes.

Primary files:

- `apps/web/src/pages/SimpleChatPage.tsx`
- `apps/web/src/pages/TradingDashboardPage.tsx`
- `apps/web/src/pages/ComfyUIPage.tsx`

## Env Vars That Control Features

- `DATABASE_URL`
- `OLLAMA_URL`, `OLLAMA_API_KEY`
- `KNOWLEDGE_ROOT`, `KNOWLEDGE_INGEST_PATH`
- `COINDCX_API_KEY`, `COINDCX_API_SECRET`
- `COINDCX_PRIVATE_STREAM`
- `PLACE_ORDER`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `COMFYUI_BASE_URL`

## Known Constraints

- Non-agent chat still depends on model output quality for tool-like markup.
- Trading dashboard is currently focused on public market observability.
- Long-session conversation behavior continues to evolve.
