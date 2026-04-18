# CLAUDE.md — local-webui

## Quick start

```bash
pnpm install
# PostgreSQL on localhost, DB ai_workspace; Ollama on localhost:11434
pnpm dev
```

Open the Vite URL (usually `http://localhost:5173`). API is proxied from `/api` → `http://localhost:4000`.

## What this is

pnpm monorepo: **Vite + React** (`apps/web`), **Fastify** (`apps/server`), **@workspace/ollama-client**, **@workspace/knowledge-engine**, markdown KB in `options-buying-kb/`.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Web + server in watch mode |
| `pnpm build` | Build all workspaces |
| `pnpm exec tsx scripts/ingest.ts` | Load KB into Postgres |

## Env

- `DATABASE_URL` — Postgres (Sequelize + knowledge-engine pool). Default user/db in `apps/server/src/services/db.ts`.
- `OLLAMA_URL` — only affects **`/models`** proxy in server, not `OllamaClient` (still default `http://localhost:11434`).

## Touch points when editing

- Chat + RAG: `apps/server/src/routes/chat.ts`
- Ollama list: `apps/server/src/routes/models.ts`
- DB models: `apps/server/src/services/db.ts`
- UI/API calls: `apps/web/src/stores/useChatStore.tsx` (`/api/chat`, `/api/models`)
- Vite proxy: `apps/web/vite.config.ts`

## Gotchas

- Knowledge path is tied to running server from `apps/server` (`../../options-buying-kb`).
- Embeddings: `packages/knowledge-engine/embed.ts` uses a fixed base URL (see file); mismatch with Ollama disables vector leg of retrieval.
- See **AGENTS.md** for full architecture and agent-oriented notes.
