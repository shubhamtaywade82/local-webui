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
- `OLLAMA_URL` — Ollama API base URL for chat, models, and embeddings. Defaults to `https://ollama.com` when `OLLAMA_API_KEY` is set, otherwise `http://localhost:11434`.
- `OLLAMA_API_KEY` — bearer token for direct access to `https://ollama.com/api`.
- `OLLAMA_MODEL` — default chat model when the client does not send one.
- `OLLAMA_SUMMARY_MODEL` — optional override for conversation summarization.
- `OLLAMA_EMBED_MODEL` — embedding model for RAG (`embeddinggemma` is a sensible cloud default).
- `KNOWLEDGE_ROOT` — RAG root relative to `apps/server` cwd (default `../../knowledge`).
- `KNOWLEDGE_INGEST_PATH` — folder name under repo root for `scripts/ingest.ts` (default `knowledge`).

## Touch points when editing

- Chat + RAG: `apps/server/src/routes/chat.ts`, KB root: `apps/server/src/config/knowledgeRoot.ts`
- Ollama list: `apps/server/src/routes/models.ts`
- DB models: `apps/server/src/services/db.ts`
- UI/API calls: `apps/web/src/stores/useChatStore.tsx` (`/api/chat`, `/api/models`)
- Vite proxy: `apps/web/vite.config.ts`

## Gotchas

- Knowledge path defaults to `../../knowledge` from `apps/server` cwd; use `KNOWLEDGE_ROOT=../../options-buying-kb` for the legacy-only tree.
- For direct Ollama Cloud API, set `OLLAMA_API_KEY` and optionally `OLLAMA_URL=https://ollama.com`; the server will attach the bearer token automatically.
- See **AGENTS.md** for full architecture and agent-oriented notes.
