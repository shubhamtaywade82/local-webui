# local-webui — agent context

Local-first AI workspace: React + Vite UI, Fastify API, Ollama for chat, PostgreSQL for conversations and optional vector RAG, markdown knowledge under `options-buying-kb/`.

## Repo layout

| Path | Role |
|------|------|
| `apps/web` | React 18 SPA (`@workspace/web`), Tailwind, Vite dev server |
| `apps/server` | Fastify API (`@workspace/server`), port **4000** |
| `packages/ollama-client` | Thin Ollama `/api/chat` client (non-stream + stream) |
| `packages/knowledge-engine` | Scan/chunk/embed/search over markdown; DB + in-memory hybrid |
| `options-buying-kb/` | Default on-disk knowledge tree (RAG source) |
| `scripts/ingest.ts` | One-shot DB ingestion for the knowledge engine |

## Runtime dependencies

1. **PostgreSQL** — default URL: `postgresql://postgres:postgres@localhost:5432/ai_workspace` (override with `DATABASE_URL`). Sequelize syncs `conversation` / `message` tables on server start.
2. **Ollama** — default `http://localhost:11434` for chat (`OllamaClient`) and model listing (`OLLAMA_URL` on **models** route only). Chat defaults to model `qwen2.5:0.5b` if none sent.
3. **Embeddings** — `packages/knowledge-engine/embed.ts` calls `http://localhost:12434/api/embeddings` with model `nomic-embed-text`. If that endpoint fails, retrieval falls back to keyword/hybrid paths without vectors.

## Commands (repo root)

```bash
pnpm install          # install all workspaces
pnpm dev              # parallel: Vite (web) + tsx watch (server)
pnpm build            # all packages: tsc / vite build
pnpm test             # recursive test (many workspaces may define no test script)
```

**Ingest knowledge into Postgres** (from repo root, DB must exist):

```bash
pnpm exec tsx scripts/ingest.ts
```

## URLs and proxying

- **API**: `http://localhost:4000` — routes: `/health`, `/chat`, `/conversations`, `/models`.
- **Web dev**: Vite default (typically `http://localhost:5173`). Browser calls `/api/*`; Vite rewrites to the backend and strips the `/api` prefix (`vite.config.ts`).

## Request flow (chat)

1. Web `POST /api/chat` → Fastify `POST /chat/`.
2. Server may create a conversation in DB; runs `KnowledgeEngine.retrieve` on the last user message (Postgres chunks first, else in-memory hybrid).
3. Long threads: if more than 10 DB messages, history is summarized via `OllamaClient.chat("qwen2.5:0.5b", …)` before building the system prompt.
4. Response is **SSE**: `text/event-stream`, lines `data: {"sources"|"token"|"error"|"conversation_id",…}`.
5. Optional **thinking** mode: body `thinking: true` extends the system prompt with `<think>` instructions.

## Environment variables

| Variable | Used by | Default |
|----------|---------|---------|
| `DATABASE_URL` | `apps/server` Sequelize, `knowledge-engine` Pool | `postgresql://postgres:postgres@localhost:5432/ai_workspace` |
| `OLLAMA_URL` | `apps/server` routes/models only | `http://localhost:11434` |

`OllamaClient` base URL is **not** wired to `OLLAMA_URL` today (constructor default `http://localhost:11434`).

## Conventions for changes

- **pnpm workspace** — depend with `workspace:*` on `@workspace/*` packages.
- **TypeScript** — server builds with `tsc`; web uses `tsc && vite build`.
- **Knowledge root** — `chat.ts` resolves KB with `path.join(process.cwd(), "../../options-buying-kb")` relative to **`apps/server` cwd**; changing working directory or layout breaks RAG paths.
- **UI state** — chat/settings live in `useChatStore.tsx` (reducer + context); model list from `GET /api/models`.

## Principles (align with parent workspace)

- Tooling and model names should remain configurable where possible; document new env vars when adding them.
- Streaming and DB persistence are intertwined in `chat.ts` — preserve ordering: metadata → stream → persist assistant message.

## Known quirks / tech debt (for agents)

- Web client does not send `conversation_id` on chat requests; server may create a new DB conversation per request unless extended.
- Root `pnpm test` may no-op or warn if child packages lack a `test` script.
- Embedding URL port **12434** in `embed.ts` is easy to misconfigure vs Ollama’s usual **11434**; confirm against the user’s Ollama listen address.
