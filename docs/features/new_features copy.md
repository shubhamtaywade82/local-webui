# local-webui Feature Inventory (Compact)

This file is a compact summary of `new_features.md`.

## Stack

- Web: React + Vite (`apps/web`)
- API: Fastify + WebSocket (`apps/server`)
- Data: PostgreSQL for conversations/messages/summaries
- AI: local/cloud provider flow via `@workspace/ollama-client`
- Shared packages: tools, runtime, trading, knowledge, execution

## Implemented Capabilities

### Chat + RAG

- Token streaming over WS.
- Retrieval context from markdown knowledge corpus.
- Conversation summary path for long histories.
- Optional live CoinDCX context injection for market prompts.

### Agent Runtime

- Optional `agentMode` tool loop.
- Structured step and tool-call event emission.
- Runtime-level duplicate call guard behavior.

### File Tooling

- Text file read/list/edit/create/delete.
- Raster image write attempts blocked in text-edit path.
- ComfyUI route used for image generation workflows.

### Trading and Market

- Public futures APIs: RT, instruments, orderbook, OHLCV, trades.
- Shared market pulse stream for UI updates.
- Authenticated futures operations via key-based tools.

### Trading Safety

- Create-order actions are disabled unless `PLACE_ORDER` is truthy.
- Keyed authenticated actions require `COINDCX_API_KEY` + `COINDCX_API_SECRET`.

## Feature Flags / Runtime Controls

- `simpleChat`
- `agentMode`
- `thinking`
- `COINDCX_PRIVATE_STREAM`
- `PLACE_ORDER`
- `FUTURES_AUTOMATION_ENABLED`

## Primary Improvement Areas

- Prevent malformed internal tag leakage in streamed chat output.
- Expand authenticated account visibility in trading UI.
- Add more integration tests for WS chat and stream recovery.
