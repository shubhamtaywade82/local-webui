# CLAUDE.md — local-webui

## Quick start

```bash
pnpm install
# PostgreSQL on localhost, DB ai_workspace; Ollama on localhost:11434
pnpm dev
```

Open the Vite URL (usually `http://localhost:5173`). API is proxied from `/api` → `http://localhost:4000`.

## What this is

pnpm monorepo: **Vite + React** (`apps/web`), **Fastify** (`apps/server`), **@workspace/ollama-client**, **@workspace/knowledge-engine**, markdown KB in `knowledge/` (override with `KNOWLEDGE_ROOT`).

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Web + server in watch mode |
| `pnpm build` | Build all workspaces |
| `pnpm exec tsx scripts/ingest.ts` | Load KB into Postgres (`knowledge/` by default; `KNOWLEDGE_INGEST_PATH` to change) |

## Env

- `DATABASE_URL` — Postgres (Sequelize + knowledge-engine pool). Default user/db in `apps/server/src/services/db.ts`.
- `OLLAMA_URL` — cloud Ollama API base URL. Used only when the UI provider setting is `cloud`. Defaults to `https://ollama.com`.
- `OLLAMA_API_KEY` — bearer token for direct access to the cloud Ollama API. Used only in `cloud` mode.
- `KNOWLEDGE_ROOT` — RAG root relative to `apps/server` cwd (default `../../knowledge`).
- `KNOWLEDGE_INGEST_PATH` — folder name under repo root for `scripts/ingest.ts` (default `knowledge`).
- `COINDCX_API_KEY` — CoinDCX API key for authenticated futures trading tools.
- `COINDCX_API_SECRET` — CoinDCX API secret for HMAC-SHA256 request signing.

## Touch points when editing

- Chat + RAG: `apps/server/src/routes/chat.ts`, KB root: `apps/server/src/config/knowledgeRoot.ts`
- Ollama list: `apps/server/src/routes/models.ts`
- DB models: `apps/server/src/services/db.ts`
- UI/API calls: `apps/web/src/stores/useChatStore.tsx` (`/api/chat`, `/api/models`, provider selection + model persistence)
- Vite proxy: `apps/web/vite.config.ts`

## Gotchas

- Knowledge path defaults to `../../knowledge` from `apps/server` cwd; use `KNOWLEDGE_ROOT=../../options-buying-kb` for the legacy-only tree.
- Local vs cloud model selection now lives in the UI settings. The backend only needs `OLLAMA_API_KEY` and optional `OLLAMA_URL` for cloud mode.
- See **AGENTS.md** for full architecture and agent-oriented notes.
