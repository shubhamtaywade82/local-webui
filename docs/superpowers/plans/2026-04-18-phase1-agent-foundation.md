# Phase 1: Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub `agent_runtime` and `tools` packages with a working ReAct planning loop and full tool registry, add `Artifact`/`AgentExecution` DB models, and wire `agentMode` into the chat route and settings UI.

**Architecture:** The `agent_runtime` package runs a Reason→Act→Observe loop using `OllamaClient.chat()` for structured JSON tool decisions; tool outputs are appended to context until the model calls `finish`. The chat WebSocket route branches on `agentMode: true` to use the runtime instead of the direct stream path. In `step` mode the runtime pauses before each tool call and waits for a client `agent_step_approve` WS message.

**Tech Stack:** TypeScript, Node.js `child_process` (Docker sandbox), `@workspace/ollama-client`, Sequelize (new models), Fastify WebSocket, React context + Zustand pattern (existing `useChatStore`), vitest (new, for unit tests on tool logic and ReAct loop).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/agent-runtime/types.ts` | Shared types: `Tool`, `ToolResult`, `AgentConfig`, `AgentRunOptions`, `LoopEvent` |
| Modify | `packages/agent-runtime/index.ts` | ReAct loop implementation |
| Create | `packages/agent-runtime/package.json` | Add vitest, update deps |
| Create | `packages/tools/types.ts` | `BaseTool` abstract class + `ToolSchema` type |
| Create | `packages/tools/file-tools.ts` | `ReadFile`, `ListFiles`, `EditFile`, `CreateFile`, `DeleteFile` |
| Create | `packages/tools/db-tools.ts` | `QueryDatabase`, `DescribeSchema` (uses main pool until Phase 2 adds sandbox) |
| Create | `packages/tools/kb-tools.ts` | `SearchKb`, `IngestDocument` |
| Create | `packages/tools/code-tools.ts` | `RunCode` (Docker) |
| Create | `packages/tools/web-tools.ts` | `WebSearch`, `FetchUrl` (stubs) |
| Modify | `packages/tools/index.ts` | `ToolRegistry` with `register`/`execute`/`schemas()` |
| Create | `packages/tools/package.json` | Add vitest |
| Create | `packages/agent-runtime/tests/react-loop.test.ts` | Unit tests for loop logic |
| Create | `packages/tools/tests/file-tools.test.ts` | Unit tests for file tools |
| Modify | `apps/server/src/services/db.ts` | Add `Artifact`, `AgentExecution` models + methods |
| Modify | `apps/server/src/routes/chat.ts` | Branch on `agentMode`, wire `AgentRuntime` |
| Modify | `apps/web/src/stores/useChatStore.tsx` | Add `agentMode`, `maxIterations`, step approval WS flow |
| Modify | `apps/web/src/components/layout/SettingsModal.tsx` | Agent mode toggle + max iterations input |

---

## Task 1: Add vitest to packages

**Files:**
- Modify: `packages/agent-runtime/package.json`
- Modify: `packages/tools/package.json`

- [ ] **Step 1: Update agent-runtime package.json**

```json
{
  "name": "@workspace/agent-runtime",
  "version": "1.0.0",
  "main": "index.ts",
  "types": "index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@workspace/ollama-client": "workspace:*",
    "@workspace/tools": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Update tools package.json**

```json
{
  "name": "@workspace/tools",
  "version": "1.0.0",
  "main": "index.ts",
  "types": "index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 3: Install**

```bash
pnpm install
```

Expected: vitest added to both packages, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-runtime/package.json packages/tools/package.json
git commit -m "chore: add vitest to agent-runtime and tools packages"
```

---

## Task 2: Shared types

**Files:**
- Create: `packages/agent-runtime/types.ts`
- Create: `packages/tools/types.ts`

- [ ] **Step 1: Write `packages/tools/types.ts`**

```typescript
export interface ToolSchema {
  name: string;
  description: string;
  args: Record<string, { type: string; description: string; required?: boolean }>;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: ToolSchema;
  abstract execute(args: Record<string, unknown>): Promise<string>;
}
```

- [ ] **Step 2: Write `packages/agent-runtime/types.ts`**

```typescript
export interface AgentConfig {
  model: string;
  maxIterations: number;
  mode: 'auto' | 'step';
}

export interface LoopEvent {
  type: 'agent_step' | 'agent_step_pending' | 'token' | 'tool_call' | 'done' | 'error';
  payload: Record<string, unknown>;
}

export type EventEmitter = (event: LoopEvent) => void;

export type StepApprovalFn = (stepId: string, toolName: string, toolInput: Record<string, unknown>) => Promise<boolean>;
```

- [ ] **Step 3: Commit**

```bash
git add packages/tools/types.ts packages/agent-runtime/types.ts
git commit -m "feat: add shared types for tools and agent-runtime"
```

---

## Task 3: Tool registry

**Files:**
- Modify: `packages/tools/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/tools/tests/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../index';
import { BaseTool, ToolSchema } from '../types';

class EchoTool extends BaseTool {
  readonly name = 'echo';
  readonly description = 'Echoes input';
  readonly schema: ToolSchema = {
    name: 'echo',
    description: 'Echoes input',
    args: { message: { type: 'string', description: 'text to echo', required: true } }
  };
  async execute(args: Record<string, unknown>): Promise<string> {
    return String(args.message);
  }
}

describe('ToolRegistry', () => {
  it('registers and executes a tool', async () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    const result = await registry.execute('echo', { message: 'hello' });
    expect(result).toBe('hello');
  });

  it('throws on unknown tool', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('missing', {})).rejects.toThrow('Tool "missing" not found');
  });

  it('returns schemas array', () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    const schemas = registry.schemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('echo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/tools && pnpm test
```

Expected: FAIL — `ToolRegistry` doesn't have `schemas()` method.

- [ ] **Step 3: Implement `packages/tools/index.ts`**

```typescript
import { BaseTool, ToolSchema } from './types';

export { BaseTool, ToolSchema } from './types';
export * from './file-tools';
export * from './db-tools';
export * from './kb-tools';
export * from './code-tools';
export * from './web-tools';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool.execute(args);
  }

  schemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map(t => t.schema);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/tools && pnpm test
```

Expected: PASS (registry tests pass; re-exports will fail until tool files exist — that's fine for now).

- [ ] **Step 5: Commit**

```bash
git add packages/tools/index.ts packages/tools/tests/registry.test.ts
git commit -m "feat: implement ToolRegistry with schemas() and type-safe execute"
```

---

## Task 4: File tools

**Files:**
- Create: `packages/tools/file-tools.ts`
- Create: `packages/tools/tests/file-tools.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ReadFileTool, ListFilesTool, EditFileTool, CreateFileTool, DeleteFileTool } from '../file-tools';

const TMP = join(process.cwd(), 'test-tmp-workspace');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('ReadFileTool', () => {
  it('reads file content', async () => {
    writeFileSync(join(TMP, 'hello.txt'), 'hello world');
    const tool = new ReadFileTool(TMP);
    const result = await tool.execute({ path: 'hello.txt' });
    expect(result).toBe('hello world');
  });

  it('returns error string for missing file', async () => {
    const tool = new ReadFileTool(TMP);
    const result = await tool.execute({ path: 'missing.txt' });
    expect(result).toContain('Error');
  });
});

describe('ListFilesTool', () => {
  it('lists files in directory', async () => {
    writeFileSync(join(TMP, 'a.ts'), '');
    writeFileSync(join(TMP, 'b.ts'), '');
    const tool = new ListFilesTool(TMP);
    const result = await tool.execute({ path: '.' });
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
  });
});

describe('EditFileTool', () => {
  it('overwrites file content', async () => {
    writeFileSync(join(TMP, 'edit.ts'), 'old');
    const tool = new EditFileTool(TMP);
    await tool.execute({ path: 'edit.ts', content: 'new content' });
    const { readFileSync } = await import('fs');
    expect(readFileSync(join(TMP, 'edit.ts'), 'utf8')).toBe('new content');
  });
});

describe('CreateFileTool', () => {
  it('creates new file', async () => {
    const tool = new CreateFileTool(TMP);
    await tool.execute({ path: 'new.ts', content: 'export {}' });
    expect(existsSync(join(TMP, 'new.ts'))).toBe(true);
  });
});

describe('DeleteFileTool', () => {
  it('deletes file when confirm is true', async () => {
    writeFileSync(join(TMP, 'del.ts'), '');
    const tool = new DeleteFileTool(TMP);
    const result = await tool.execute({ path: 'del.ts', confirm: true });
    expect(existsSync(join(TMP, 'del.ts'))).toBe(false);
    expect(result).toContain('Deleted');
  });

  it('refuses deletion when confirm is not true', async () => {
    writeFileSync(join(TMP, 'safe.ts'), '');
    const tool = new DeleteFileTool(TMP);
    const result = await tool.execute({ path: 'safe.ts', confirm: false });
    expect(existsSync(join(TMP, 'safe.ts'))).toBe(true);
    expect(result).toContain('confirm: true');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/tools && pnpm test tests/file-tools.test.ts
```

Expected: FAIL — `file-tools` module not found.

- [ ] **Step 3: Implement `packages/tools/file-tools.ts`**

```typescript
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { BaseTool, ToolSchema } from './types';

function safePath(workspaceRoot: string, relativePath: string): string {
  const resolved = resolve(join(workspaceRoot, relativePath));
  if (!resolved.startsWith(resolve(workspaceRoot))) {
    throw new Error(`Path traversal blocked: ${relativePath}`);
  }
  return resolved;
}

export class ReadFileTool extends BaseTool {
  readonly name = 'read_file';
  readonly description = 'Read the content of a file in the workspace';
  readonly schema: ToolSchema = {
    name: 'read_file',
    description: 'Read file content',
    args: { path: { type: 'string', description: 'Relative path from workspace root', required: true } }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      return readFileSync(abs, 'utf8');
    } catch (e) {
      return `Error reading file: ${(e as Error).message}`;
    }
  }
}

export class ListFilesTool extends BaseTool {
  readonly name = 'list_files';
  readonly description = 'List files and directories at a path in the workspace';
  readonly schema: ToolSchema = {
    name: 'list_files',
    description: 'List files in directory',
    args: { path: { type: 'string', description: 'Relative path from workspace root', required: true } }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      const entries = readdirSync(abs, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`).join('\n');
    } catch (e) {
      return `Error listing files: ${(e as Error).message}`;
    }
  }
}

export class EditFileTool extends BaseTool {
  readonly name = 'edit_file';
  readonly description = 'Overwrite an existing file with new content';
  readonly schema: ToolSchema = {
    name: 'edit_file',
    description: 'Edit file content',
    args: {
      path: { type: 'string', description: 'Relative path from workspace root', required: true },
      content: { type: 'string', description: 'New file content', required: true }
    }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      writeFileSync(abs, String(args.content), 'utf8');
      return `File written: ${args.path}`;
    } catch (e) {
      return `Error editing file: ${(e as Error).message}`;
    }
  }
}

export class CreateFileTool extends BaseTool {
  readonly name = 'create_file';
  readonly description = 'Create a new file with content';
  readonly schema: ToolSchema = {
    name: 'create_file',
    description: 'Create new file',
    args: {
      path: { type: 'string', description: 'Relative path from workspace root', required: true },
      content: { type: 'string', description: 'Initial file content', required: true }
    }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, String(args.content), 'utf8');
      return `File created: ${args.path}`;
    } catch (e) {
      return `Error creating file: ${(e as Error).message}`;
    }
  }
}

export class DeleteFileTool extends BaseTool {
  readonly name = 'delete_file';
  readonly description = 'Delete a file (requires confirm: true)';
  readonly schema: ToolSchema = {
    name: 'delete_file',
    description: 'Delete a file',
    args: {
      path: { type: 'string', description: 'Relative path from workspace root', required: true },
      confirm: { type: 'boolean', description: 'Must be true to proceed with deletion', required: true }
    }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    if (args.confirm !== true) {
      return 'Deletion refused. Pass confirm: true to delete files.';
    }
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      rmSync(abs);
      return `Deleted: ${args.path}`;
    } catch (e) {
      return `Error deleting file: ${(e as Error).message}`;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/tools && pnpm test tests/file-tools.test.ts
```

Expected: PASS (5 describe blocks, all green).

- [ ] **Step 5: Commit**

```bash
git add packages/tools/file-tools.ts packages/tools/tests/file-tools.test.ts
git commit -m "feat: implement file tools (read, list, edit, create, delete) with path traversal guard"
```

---

## Task 5: DB tools (pre-sandbox, uses main pool)

**Files:**
- Create: `packages/tools/db-tools.ts`

Note: Phase 2 replaces the pool here with `agent_sandbox_user`. For now, tools use the main `DATABASE_URL` pool — query validation (no DROP/TRUNCATE/DELETE/UPDATE) is the only guard.

- [ ] **Step 1: Write `packages/tools/db-tools.ts`**

```typescript
import { Pool } from 'pg';
import { BaseTool, ToolSchema } from './types';

const BLOCKED_KEYWORDS = /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE)\b/i;

function createPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_workspace' });
}

export class QueryDatabaseTool extends BaseTool {
  readonly name = 'query_database';
  readonly description = 'Run a SELECT query against the database. No mutations allowed.';
  readonly schema: ToolSchema = {
    name: 'query_database',
    description: 'Execute a SELECT SQL query',
    args: { sql: { type: 'string', description: 'SQL SELECT statement', required: true } }
  };

  private pool: Pool;
  constructor(pool?: Pool) {
    super();
    this.pool = pool ?? createPool();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const sql = String(args.sql);
    if (BLOCKED_KEYWORDS.test(sql)) {
      return 'Error: Only SELECT queries are allowed.';
    }
    try {
      const result = await this.pool.query(sql);
      if (result.rows.length === 0) return 'Query returned 0 rows.';
      const cols = result.fields.map(f => f.name);
      const rows = result.rows.map(r => cols.map(c => String(r[c] ?? '')).join(' | ')).join('\n');
      return `${cols.join(' | ')}\n${'-'.repeat(40)}\n${rows}\n(${result.rows.length} rows)`;
    } catch (e) {
      return `Query error: ${(e as Error).message}`;
    }
  }
}

export class DescribeSchemaTool extends BaseTool {
  readonly name = 'describe_schema';
  readonly description = 'Return the table and column names available in the database';
  readonly schema: ToolSchema = {
    name: 'describe_schema',
    description: 'Describe database schema',
    args: {}
  };

  private pool: Pool;
  constructor(pool?: Pool) {
    super();
    this.pool = pool ?? createPool();
  }

  async execute(_args: Record<string, unknown>): Promise<string> {
    try {
      const result = await this.pool.query(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);
      const tables: Record<string, string[]> = {};
      for (const row of result.rows) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
      }
      return Object.entries(tables)
        .map(([t, cols]) => `${t}:\n  ${cols.join('\n  ')}`)
        .join('\n\n');
    } catch (e) {
      return `Schema error: ${(e as Error).message}`;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tools/db-tools.ts
git commit -m "feat: add QueryDatabase and DescribeSchema tools (SELECT-only, pre-sandbox)"
```

---

## Task 6: KB tools

**Files:**
- Create: `packages/tools/kb-tools.ts`

- [ ] **Step 1: Write `packages/tools/kb-tools.ts`**

```typescript
import { BaseTool, ToolSchema } from './types';

export class SearchKbTool extends BaseTool {
  readonly name = 'search_kb';
  readonly description = 'Semantic search over the knowledge base documents';
  readonly schema: ToolSchema = {
    name: 'search_kb',
    description: 'Search knowledge base',
    args: { query: { type: 'string', description: 'Search query', required: true } }
  };

  constructor(private knowledgeEngine: { retrieve: (q: string) => Promise<Array<{ path: string; content: string }>> }) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const docs = await this.knowledgeEngine.retrieve(String(args.query));
      if (docs.length === 0) return 'No matching documents found.';
      return docs.map(d => `FILE: ${d.path}\n${d.content}`).join('\n\n---\n\n');
    } catch (e) {
      return `Search error: ${(e as Error).message}`;
    }
  }
}

export class IngestDocumentTool extends BaseTool {
  readonly name = 'ingest_document';
  readonly description = 'Add a document to the knowledge base and trigger re-indexing';
  readonly schema: ToolSchema = {
    name: 'ingest_document',
    description: 'Ingest document into knowledge base',
    args: { path: { type: 'string', description: 'Absolute or relative path to markdown file', required: true } }
  };

  constructor(private knowledgeEngine: { refresh: () => Promise<void>; ingest: () => Promise<void> }) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      await this.knowledgeEngine.refresh();
      await this.knowledgeEngine.ingest();
      return `Document ingested and knowledge base refreshed. Path: ${args.path}`;
    } catch (e) {
      return `Ingest error: ${(e as Error).message}`;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tools/kb-tools.ts
git commit -m "feat: add SearchKb and IngestDocument tools"
```

---

## Task 7: Code execution tool (Docker sandbox)

**Files:**
- Create: `packages/tools/code-tools.ts`

- [ ] **Step 1: Verify Docker is available**

```bash
docker --version
```

Expected: `Docker version 24.x.x` or similar. If not installed, skip `RunCodeTool` and stub it.

- [ ] **Step 2: Write `packages/tools/code-tools.ts`**

```typescript
import { execSync, spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BaseTool, ToolSchema } from './types';

const SUPPORTED_LANGUAGES: Record<string, { image: string; ext: string; cmd: string }> = {
  javascript: { image: 'node:20-alpine', ext: 'js', cmd: 'node /code/run.js' },
  typescript: { image: 'node:20-alpine', ext: 'ts', cmd: 'npx tsx /code/run.ts' },
  python: { image: 'python:3.12-alpine', ext: 'py', cmd: 'python /code/run.py' },
};

export class RunCodeTool extends BaseTool {
  readonly name = 'run_code';
  readonly description = 'Execute code in an isolated Docker sandbox (network-blocked, 30s timeout)';
  readonly schema: ToolSchema = {
    name: 'run_code',
    description: 'Run code in Docker sandbox',
    args: {
      language: { type: 'string', description: 'javascript | typescript | python', required: true },
      code: { type: 'string', description: 'Code to execute', required: true }
    }
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const language = String(args.language).toLowerCase();
    const lang = SUPPORTED_LANGUAGES[language];
    if (!lang) {
      return `Error: Unsupported language "${language}". Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`;
    }

    const tmpDir = join(tmpdir(), `agent-code-${Date.now()}`);
    const codeFile = join(tmpDir, `run.${lang.ext}`);

    try {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(codeFile, String(args.code), 'utf8');

      const result = spawnSync('docker', [
        'run',
        '--rm',
        '--network', 'none',
        '--memory', '256m',
        '--cpus', '0.5',
        '--ulimit', 'nofile=64:64',
        '-v', `${tmpDir}:/code:ro`,
        lang.image,
        'sh', '-c', lang.cmd
      ], { timeout: 30000, encoding: 'utf8' });

      const stdout = (result.stdout || '').slice(0, 10240);
      const stderr = (result.stderr || '').slice(0, 2048);

      if (result.status !== 0) {
        return `Exit code ${result.status}\n${stderr || stdout}`;
      }
      return stdout || '(no output)';
    } catch (e) {
      return `Execution error: ${(e as Error).message}`;
    } finally {
      try { unlinkSync(codeFile); } catch {}
      try { execSync(`rm -rf ${tmpDir}`, { timeout: 5000 }); } catch {}
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/tools/code-tools.ts
git commit -m "feat: add RunCode tool with Docker sandbox (network-blocked, 30s timeout)"
```

---

## Task 8: Web tools (stubs)

**Files:**
- Create: `packages/tools/web-tools.ts`

- [ ] **Step 1: Write `packages/tools/web-tools.ts`**

```typescript
import { BaseTool, ToolSchema } from './types';

export class WebSearchTool extends BaseTool {
  readonly name = 'web_search';
  readonly description = '[STUB] Search the web — not implemented yet';
  readonly schema: ToolSchema = {
    name: 'web_search',
    description: 'Search the web (stub)',
    args: { query: { type: 'string', description: 'Search query', required: true } }
  };

  async execute(_args: Record<string, unknown>): Promise<string> {
    return 'web_search is not implemented yet. Try search_kb for local knowledge.';
  }
}

export class FetchUrlTool extends BaseTool {
  readonly name = 'fetch_url';
  readonly description = '[STUB] Fetch a URL — not implemented yet';
  readonly schema: ToolSchema = {
    name: 'fetch_url',
    description: 'Fetch URL content (stub)',
    args: { url: { type: 'string', description: 'URL to fetch', required: true } }
  };

  async execute(_args: Record<string, unknown>): Promise<string> {
    return 'fetch_url is not implemented yet.';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tools/web-tools.ts
git commit -m "feat: add web_search and fetch_url as stubs for future implementation"
```

---

## Task 9: AgentRuntime — ReAct loop

**Files:**
- Modify: `packages/agent-runtime/index.ts`
- Create: `packages/agent-runtime/tests/react-loop.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentRuntime } from '../index';
import { ToolRegistry, BaseTool, ToolSchema } from '@workspace/tools';
import { AgentConfig, EventEmitter } from '../types';

class MockTool extends BaseTool {
  readonly name = 'mock_tool';
  readonly description = 'Mock tool for testing';
  readonly schema: ToolSchema = {
    name: 'mock_tool',
    description: 'Mock',
    args: { input: { type: 'string', description: 'input', required: true } }
  };
  async execute(args: Record<string, unknown>): Promise<string> {
    return `mock result: ${args.input}`;
  }
}

function mockOllama(responses: Array<{ tool: string; args: Record<string, unknown>; thought: string }>) {
  let callCount = 0;
  return {
    chat: async (_model: string, _messages: unknown[]) => {
      const r = responses[callCount++] ?? { tool: 'finish', args: { answer: 'done' }, thought: 'done' };
      return { message: { content: JSON.stringify(r) } };
    },
    stream: async (_model: string, _messages: unknown[], onToken: (t: string) => void) => {
      onToken('streamed answer');
    }
  };
}

describe('AgentRuntime', () => {
  it('calls finish tool and emits done event', async () => {
    const registry = new ToolRegistry();
    const ollama = mockOllama([{ tool: 'finish', args: { answer: 'The answer is 42' }, thought: 'I know the answer' }]);
    const config: AgentConfig = { model: 'test', maxIterations: 5, mode: 'auto' };
    const runtime = new AgentRuntime(ollama as any, registry, config);

    const events: string[] = [];
    const emit: EventEmitter = (e) => events.push(e.type);

    await runtime.run('What is 6*7?', [], emit);
    expect(events).toContain('done');
  });

  it('executes a tool and loops', async () => {
    const registry = new ToolRegistry();
    registry.register(new MockTool());
    const ollama = mockOllama([
      { tool: 'mock_tool', args: { input: 'test' }, thought: 'need mock' },
      { tool: 'finish', args: { answer: 'mock result: test' }, thought: 'done' }
    ]);
    const config: AgentConfig = { model: 'test', maxIterations: 5, mode: 'auto' };
    const runtime = new AgentRuntime(ollama as any, registry, config);

    const steps: string[] = [];
    const emit: EventEmitter = (e) => {
      if (e.type === 'agent_step') steps.push((e.payload as any).tool ?? 'done');
    };

    await runtime.run('Use mock tool', [], emit);
    expect(steps).toContain('mock_tool');
  });

  it('stops at maxIterations', async () => {
    const registry = new ToolRegistry();
    registry.register(new MockTool());
    const infiniteOllama = {
      chat: async () => ({ message: { content: JSON.stringify({ tool: 'mock_tool', args: { input: 'x' }, thought: 'loop' }) } }),
      stream: async (_: any, __: any, onToken: (t: string) => void) => { onToken('stopped'); }
    };
    const config: AgentConfig = { model: 'test', maxIterations: 3, mode: 'auto' };
    const runtime = new AgentRuntime(infiniteOllama as any, registry, config);

    const events: Array<{ type: string; payload: any }> = [];
    await runtime.run('Loop forever', [], (e) => events.push(e));
    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/agent-runtime && pnpm test
```

Expected: FAIL — old stub `AgentRuntime` doesn't match the new interface.

- [ ] **Step 3: Implement `packages/agent-runtime/index.ts`**

```typescript
import { OllamaClient } from '@workspace/ollama-client';
import { ToolRegistry } from '@workspace/tools';
import { AgentConfig, EventEmitter, StepApprovalFn } from './types';

interface ToolCall {
  thought: string;
  tool: string;
  args: Record<string, unknown>;
}

function buildSystemPrompt(schemas: ReturnType<ToolRegistry['schemas']>): string {
  const toolList = schemas.map(s => {
    const argStr = Object.entries(s.args)
      .map(([k, v]) => `  "${k}": ${v.type}${v.required ? ' (required)' : ''} — ${v.description}`)
      .join('\n');
    return `- ${s.name}: ${s.description}\n  args:\n${argStr}`;
  }).join('\n\n');

  return `You are an AI agent that completes tasks using tools.

Available tools:
${toolList}

On every turn, respond ONLY with valid JSON matching this schema:
{"thought": "<your reasoning>", "tool": "<tool_name>", "args": {<tool arguments>}}

When the task is complete, use the "finish" tool:
{"thought": "<final reasoning>", "tool": "finish", "args": {"answer": "<comprehensive final answer>"}}

Rules:
- ONLY respond with JSON — no prose, no markdown, no explanation outside the JSON
- Always include "thought" to explain your reasoning
- Use finish when you have enough information to answer`;
}

function parseToolCall(content: string): ToolCall | null {
  try {
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (typeof parsed.tool !== 'string') return null;
    return { thought: parsed.thought ?? '', tool: parsed.tool, args: parsed.args ?? {} };
  } catch {
    return null;
  }
}

export class AgentRuntime {
  constructor(
    private llm: OllamaClient,
    private tools: ToolRegistry,
    private config: AgentConfig
  ) {}

  async run(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    emit: EventEmitter,
    onApproval?: StepApprovalFn
  ): Promise<void> {
    const systemPrompt = buildSystemPrompt(this.tools.schemas());
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;

      let response: { message?: { content: string } };
      try {
        response = await this.llm.chat(this.config.model, messages);
      } catch (e) {
        emit({ type: 'error', payload: { error: `LLM call failed: ${(e as Error).message}`, iteration } });
        return;
      }

      const content = response.message?.content ?? '';
      const toolCall = parseToolCall(content);

      if (!toolCall) {
        // Model returned unparseable response — treat as finish
        emit({ type: 'agent_step', payload: { id: `step-${iteration}`, label: 'Parse error — treating as finish', status: 'error', iteration } });
        const finalMessages = [...messages, { role: 'assistant', content }];
        await this.streamFinish(userMessage, finalMessages, emit);
        return;
      }

      if (toolCall.tool === 'finish') {
        emit({ type: 'agent_step', payload: { id: `step-${iteration}`, label: 'Synthesizing answer', tool: 'finish', status: 'success', iteration } });
        const answer = String(toolCall.args.answer ?? '');
        // Stream answer word by word
        const words = answer.split(' ');
        for (const word of words) {
          emit({ type: 'token', payload: { token: word + ' ' } });
        }
        emit({ type: 'done', payload: { iteration } });
        return;
      }

      // Step-mode approval gate
      if (this.config.mode === 'step' && onApproval) {
        emit({ type: 'agent_step_pending', payload: { stepId: `step-${iteration}`, toolName: toolCall.tool, toolInput: toolCall.args } });
        const approved = await onApproval(`step-${iteration}`, toolCall.tool, toolCall.args);
        if (!approved) {
          emit({ type: 'agent_step', payload: { id: `step-${iteration}`, label: `Tool "${toolCall.tool}" rejected by user`, status: 'error', iteration } });
          emit({ type: 'done', payload: { iteration, aborted: true } });
          return;
        }
      }

      // Emit running step
      emit({ type: 'agent_step', payload: { id: `step-${iteration}`, label: `Calling ${toolCall.tool}`, tool: toolCall.tool, status: 'running', iteration } });

      let toolResult: string;
      const toolStart = Date.now();
      try {
        if (!this.tools.has(toolCall.tool)) {
          toolResult = `Error: Tool "${toolCall.tool}" not found.`;
        } else {
          toolResult = await this.tools.execute(toolCall.tool, toolCall.args);
        }
      } catch (e) {
        toolResult = `Tool error: ${(e as Error).message}`;
      }

      const duration = Date.now() - toolStart;
      emit({
        type: 'tool_call',
        payload: { tool: toolCall.tool, args: toolCall.args, result: toolResult, duration }
      });
      emit({
        type: 'agent_step',
        payload: { id: `step-${iteration}`, label: `${toolCall.tool} completed`, tool: toolCall.tool, status: 'success', duration, iteration }
      });

      // Append to messages for next iteration
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `Tool result for ${toolCall.tool}:\n${toolResult}` });
    }

    // Max iterations hit
    emit({ type: 'agent_step', payload: { id: 'max-iter', label: `Max iterations (${this.config.maxIterations}) reached`, status: 'error' } });
    emit({ type: 'done', payload: { iteration, maxIterationsReached: true } });
  }

  private async streamFinish(
    _userMessage: string,
    messages: Array<{ role: string; content: string }>,
    emit: EventEmitter
  ): Promise<void> {
    try {
      await this.llm.stream(this.config.model, messages, (token) => {
        emit({ type: 'token', payload: { token } });
      });
    } catch (e) {
      emit({ type: 'error', payload: { error: `Stream error: ${(e as Error).message}` } });
    }
    emit({ type: 'done', payload: {} });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/agent-runtime && pnpm test
```

Expected: PASS — all 3 describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-runtime/index.ts packages/agent-runtime/tests/react-loop.test.ts
git commit -m "feat: implement AgentRuntime with ReAct loop, step-mode approval, max-iteration guard"
```

---

## Task 10: Add Artifact and AgentExecution DB models

**Files:**
- Modify: `apps/server/src/services/db.ts`

- [ ] **Step 1: Add models and methods to `apps/server/src/services/db.ts`**

Add after the existing `Message` model definition and before `Conversation.hasMany(Message, ...)`:

```typescript
class Artifact extends Model {
  declare id: string;
  declare conversationId: string;
  declare fileType: string;
  declare rawContent: string;
  declare filePath: string;
  declare createdAt: Date;
}

Artifact.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  fileType: DataTypes.TEXT,
  rawContent: DataTypes.TEXT,
  filePath: DataTypes.TEXT,
}, {
  sequelize,
  modelName: 'artifact',
  underscored: true,
  updatedAt: false,
});

class AgentExecution extends Model {
  declare id: string;
  declare messageId: string;
  declare toolName: string;
  declare toolInput: Record<string, unknown>;
  declare toolOutput: Record<string, unknown>;
  declare durationMs: number;
  declare status: 'success' | 'error' | 'timeout';
  declare createdAt: Date;
}

AgentExecution.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  toolName: DataTypes.TEXT,
  toolInput: DataTypes.JSONB,
  toolOutput: DataTypes.JSONB,
  durationMs: DataTypes.INTEGER,
  status: DataTypes.TEXT,
}, {
  sequelize,
  modelName: 'agent_execution',
  underscored: true,
  updatedAt: false,
});
```

Add associations after the existing `Conversation.hasMany(Message, ...)` block:

```typescript
Conversation.hasMany(Artifact, { foreignKey: 'conversationId' });
Artifact.belongsTo(Conversation, { foreignKey: 'conversationId' });

Message.hasMany(AgentExecution, { foreignKey: 'messageId' });
AgentExecution.belongsTo(Message, { foreignKey: 'messageId' });
```

Add to the `db` export object:

```typescript
async saveAgentExecution(messageId: string, toolName: string, toolInput: Record<string, unknown>, toolOutput: Record<string, unknown>, durationMs: number, status: 'success' | 'error' | 'timeout') {
  return AgentExecution.create({ messageId, toolName, toolInput, toolOutput, durationMs, status });
},

async saveArtifact(conversationId: string, fileType: string, rawContent: string, filePath: string) {
  return Artifact.create({ conversationId, fileType, rawContent, filePath });
},

async getAgentExecutions(messageId: string) {
  return AgentExecution.findAll({ where: { messageId }, order: [['createdAt', 'ASC']] });
},
```

- [ ] **Step 2: Start server and verify DB sync succeeds**

```bash
pnpm dev
```

Expected: server starts, console shows `Database synced with Sequelize`. Check PostgreSQL:

```bash
psql $DATABASE_URL -c "\dt"
```

Expected: `artifacts` and `agent_executions` tables appear.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/db.ts
git commit -m "feat: add Artifact and AgentExecution DB models with Sequelize"
```

---

## Task 11: Wire AgentRuntime into chat route

**Files:**
- Modify: `apps/server/src/routes/chat.ts`

- [ ] **Step 1: Re-export types from `packages/agent-runtime/index.ts`**

Add to the bottom of `packages/agent-runtime/index.ts`:

```typescript
export type { AgentConfig, EventEmitter, StepApprovalFn, LoopEvent } from './types';
```

Then add imports at the top of `apps/server/src/routes/chat.ts` after existing imports:

```typescript
import { AgentRuntime, AgentConfig, StepApprovalFn } from '@workspace/agent-runtime';
import {
  ToolRegistry,
  ReadFileTool, ListFilesTool, EditFileTool, CreateFileTool, DeleteFileTool,
  QueryDatabaseTool, DescribeSchemaTool,
  SearchKbTool, IngestDocumentTool,
  RunCodeTool,
  WebSearchTool, FetchUrlTool
} from '@workspace/tools';
```

- [ ] **Step 2: Add `createToolRegistry` helper function**

Add after the imports:

```typescript
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

function createToolRegistry(knowledgeEngine: typeof knowledge): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new ReadFileTool(WORKSPACE_ROOT));
  registry.register(new ListFilesTool(WORKSPACE_ROOT));
  registry.register(new EditFileTool(WORKSPACE_ROOT));
  registry.register(new CreateFileTool(WORKSPACE_ROOT));
  registry.register(new DeleteFileTool(WORKSPACE_ROOT));
  registry.register(new QueryDatabaseTool());
  registry.register(new DescribeSchemaTool());
  registry.register(new SearchKbTool(knowledgeEngine));
  registry.register(new IngestDocumentTool(knowledgeEngine));
  registry.register(new RunCodeTool());
  registry.register(new WebSearchTool());
  registry.register(new FetchUrlTool());
  return registry;
}
```

- [ ] **Step 3: Update the WS message handler to branch on `agentMode`**

In `handleWs`, update the destructured payload line from:
```typescript
const { messages, model, conversation_id, systemPrompt: customSystemPrompt, thinking } = payload;
```
to:
```typescript
const { messages, model, conversation_id, systemPrompt: customSystemPrompt, thinking, agentMode, maxIterations, agentStepMode } = payload;
```

Replace the block from `// Persist user message` through `emitStep('synthesis', ...)` with:

```typescript
// Persist user message
await db.saveMessage(currentConversationId, 'user', lastUserMessage);

connection.socket.send(JSON.stringify({
  type: 'sources',
  sources: contextDocs.map(d => d.path),
  conversation_id: currentConversationId
}));

let savedMessageId: string | null = null;

if (agentMode) {
  // ── Agent mode: ReAct loop ──
  emitStep('planning', 'Planning agent execution', 'success');

  const agentConfig: AgentConfig = {
    model: model || 'qwen2.5:0.5b',
    maxIterations: typeof maxIterations === 'number' ? maxIterations : 10,
    mode: agentStepMode === 'step' ? 'step' : 'auto'
  };

  const toolRegistry = createToolRegistry(knowledge);
  const runtime = new AgentRuntime(ollama, toolRegistry, agentConfig);

  // Pending step approvals map: stepId → { resolve, reject }
  const pendingApprovals = new Map<string, { resolve: (v: boolean) => void }>();

  // Listen for approval/rejection messages during the run
  const approvalListener = (approvalMsg: Buffer) => {
    try {
      const msg = JSON.parse(approvalMsg.toString());
      if (msg.type === 'agent_step_approve' && pendingApprovals.has(msg.stepId)) {
        pendingApprovals.get(msg.stepId)!.resolve(true);
        pendingApprovals.delete(msg.stepId);
      } else if (msg.type === 'agent_step_reject' && pendingApprovals.has(msg.stepId)) {
        pendingApprovals.get(msg.stepId)!.resolve(false);
        pendingApprovals.delete(msg.stepId);
      }
    } catch {}
  };
  connection.socket.on('message', approvalListener);

  const onApproval: StepApprovalFn = (stepId, toolName, toolInput) => {
    return new Promise<boolean>((resolve) => {
      pendingApprovals.set(stepId, { resolve });
      connection.socket.send(JSON.stringify({
        type: 'agent_step_pending',
        stepId, toolName, toolInput,
        conversation_id: currentConversationId
      }));
    });
  };

  try {
    await runtime.run(lastUserMessage, history.map((m: any) => ({ role: m.role, content: m.content })), (event) => {
      if (event.type === 'token') {
        const token = String((event.payload as any).token ?? '');
        fullAssistantResponse += token;
        connection.socket.send(JSON.stringify({ type: 'token', token, conversation_id: currentConversationId }));
      } else if (event.type === 'agent_step' || event.type === 'agent_step_pending') {
        connection.socket.send(JSON.stringify({ type: event.type, step: event.payload, conversation_id: currentConversationId }));
      } else if (event.type === 'tool_call') {
        const p = event.payload as any;
        // Persist agent execution
        if (savedMessageId) {
          db.saveAgentExecution(savedMessageId, p.tool, p.args, { result: p.result }, p.duration, 'success').catch(() => {});
        }
        // Emit tool_call event for editor (edit_file backward compat)
        if (p.tool === 'edit_file') {
          connection.socket.send(JSON.stringify({ type: 'tool_call', tool: 'edit_file', path: p.args.path, content: p.args.content, conversation_id: currentConversationId }));
        }
        // Emit sql_result for query_database
        if (p.tool === 'query_database') {
          connection.socket.send(JSON.stringify({ type: 'sql_result', query: p.args.sql, result: p.result, durationMs: p.duration, conversation_id: currentConversationId }));
        }
      } else if (event.type === 'done') {
        connection.socket.send(JSON.stringify({ type: 'done', conversation_id: currentConversationId }));
      } else if (event.type === 'error') {
        connection.socket.send(JSON.stringify({ type: 'error', error: (event.payload as any).error, conversation_id: currentConversationId }));
      }
    }, agentConfig.mode === 'step' ? onApproval : undefined);
  } finally {
    connection.socket.off('message', approvalListener);
  }
} else {
  // ── Chat mode: existing streaming path ──
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

  emitStep('planning', 'Planning execution strategy', 'success');

  try {
    await ollama.stream(model || "qwen2.5:0.5b", finalMessages, (token) => {
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
            connection.socket.send(JSON.stringify({ type: 'tool_call', tool: 'edit_file', path: filePath, content: fileContent, conversation_id: currentConversationId }));
            buffer = buffer.substring(buffer.indexOf("</content>") + "</content>".length);
          }
        }
      }
    });

    emitStep('synthesis', 'Finalizing response', 'success');
    connection.socket.send(JSON.stringify({ type: 'done', conversation_id: currentConversationId }));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    connection.socket.send(JSON.stringify({ type: 'error', error: errorMsg, conversation_id: currentConversationId }));
  }
}
```

Also update the final save to track the saved message ID. Find:
```typescript
if (fullAssistantResponse) {
  await db.saveMessage(currentConversationId, 'assistant', fullAssistantResponse);
}
```
Replace with:
```typescript
if (fullAssistantResponse) {
  const saved = await db.saveMessage(currentConversationId, 'assistant', fullAssistantResponse);
  savedMessageId = (saved as any).id;
}
```

Also add `savedMessageId` declaration at the top of the try block (before the `agentMode` branch):
```typescript
let fullAssistantResponse = "";
let savedMessageId: string | null = null;
```

- [ ] **Step 4: Verify server starts and chat still works**

```bash
pnpm dev
```

Open `http://localhost:5173`, send a message without `agentMode`. Expected: chat responds normally (no regression).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/chat.ts
git commit -m "feat: wire AgentRuntime into chat route with agentMode branch and step approval"
```

---

## Task 12: Frontend — add agentMode state and settings

**Files:**
- Modify: `apps/web/src/stores/useChatStore.tsx`
- Modify: `apps/web/src/components/layout/SettingsModal.tsx`

- [ ] **Step 1: Add agentMode state to `useChatStore.tsx`**

In the `ChatState` interface, add:
```typescript
agentMode: boolean;
agentStepMode: 'auto' | 'step';
maxIterations: number;
```

In `ChatAction` type, add:
```typescript
| { type: 'TOGGLE_AGENT_MODE' }
| { type: 'SET_AGENT_STEP_MODE'; mode: 'auto' | 'step' }
| { type: 'SET_MAX_ITERATIONS'; count: number }
```

In the initial state (look for `isThinkingEnabled`), add:
```typescript
agentMode: false,
agentStepMode: 'auto',
maxIterations: 10,
```

In `chatReducer`, add cases:
```typescript
case 'TOGGLE_AGENT_MODE':
  return { ...state, agentMode: !state.agentMode };

case 'SET_AGENT_STEP_MODE':
  return { ...state, agentStepMode: action.mode };

case 'SET_MAX_ITERATIONS':
  return { ...state, maxIterations: action.count };
```

In `sendMessage` (look for where the WebSocket message is sent with `messages`, `model`, etc.), add to the payload:
```typescript
agentMode: state.agentMode,
agentStepMode: state.agentStepMode,
maxIterations: state.maxIterations,
```

In the WebSocket `onmessage` handler, add handling for `agent_step_pending` (in `step` mode, the UI needs to show approve/reject):
```typescript
} else if (data.type === 'agent_step_pending') {
  dispatch({ type: 'ADD_AGENT_STEP', conversationId: currentConversationId, step: { ...data.step, pendingApproval: true, stepId: data.stepId, toolName: data.toolName, toolInput: data.toolInput } });
  // Auto-approve in 'auto' mode (this branch shouldn't fire, but guard it)
  // In step mode the ResearchPanel will show approve/reject buttons
}
```

Also add a `approveAgentStep` action to the store's returned functions:
```typescript
approveAgentStep: useCallback((stepId: string, approved: boolean) => {
  const ws = wsRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: approved ? 'agent_step_approve' : 'agent_step_reject', stepId }));
  dispatch({ type: 'ADD_AGENT_STEP', conversationId: state.activeConversationId!, step: { id: stepId, pendingApproval: false, status: approved ? 'running' : 'error' } });
}, [state.activeConversationId]),
```

- [ ] **Step 2: Add agent settings to `SettingsModal.tsx`**

After the "Thinking Mode" toggle block, add:

```tsx
{/* Agent Mode */}
<div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
  <div>
    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Agent Mode</div>
    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Enable multi-step tool-using agent for complex tasks.</div>
  </div>
  <button
    onClick={() => setAgentMode(!agentMode)}
    className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0 outline-none"
    style={{ background: agentMode ? 'var(--accent)' : 'var(--bg-surface)' }}
  >
    <span
      className="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-transform duration-200"
      style={{ left: agentMode ? '22px' : '2px' }}
    />
  </button>
</div>

{/* Agent Step Mode */}
{agentMode && (
  <div className="space-y-2">
    <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
      Agent Execution Mode
    </label>
    <div className="flex gap-2">
      {(['auto', 'step'] as const).map(m => (
        <button
          key={m}
          onClick={() => setAgentStepMode(m)}
          className="flex-1 py-2 text-xs font-medium rounded-lg transition-colors"
          style={{
            background: agentStepMode === m ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: agentStepMode === m ? '#fff' : 'var(--text-secondary)',
            border: '1px solid var(--border-default)'
          }}
        >
          {m === 'auto' ? 'Auto (fully autonomous)' : 'Step-by-step (manual approval)'}
        </button>
      ))}
    </div>
  </div>
)}

{/* Max Iterations */}
{agentMode && (
  <div className="space-y-2">
    <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
      Max Agent Iterations
    </label>
    <input
      type="number"
      min={1}
      max={50}
      value={maxIterations}
      onChange={(e) => setMaxIterations(Math.min(50, Math.max(1, parseInt(e.target.value) || 10)))}
      className="w-24 text-sm rounded-lg px-3 py-2 outline-none"
      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
    />
  </div>
)}
```

Add local state at the top of `SettingsModal`:
```typescript
const [agentMode, setAgentMode] = useState(state.agentMode);
const [agentStepMode, setAgentStepMode] = useState<'auto' | 'step'>(state.agentStepMode);
const [maxIterations, setMaxIterations] = useState(state.maxIterations);
```

In `handleSave`, add:
```typescript
if (state.agentMode !== agentMode) dispatch({ type: 'TOGGLE_AGENT_MODE' });
dispatch({ type: 'SET_AGENT_STEP_MODE', mode: agentStepMode });
dispatch({ type: 'SET_MAX_ITERATIONS', count: maxIterations });
```

- [ ] **Step 3: Verify in browser**

```bash
pnpm dev
```

Open `http://localhost:5173`, open Settings. Expected: "Agent Mode" toggle and (when enabled) "Agent Execution Mode" + "Max Iterations" controls appear. Toggle agent mode on, send a message. Expected: agent step timeline updates in ResearchPanel.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/useChatStore.tsx apps/web/src/components/layout/SettingsModal.tsx
git commit -m "feat: add agentMode, stepMode, maxIterations to UI store and settings"
```

---

## Task 13: Run all Phase 1 tests

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: agent-runtime and tools tests pass. Server and web have no test scripts (ok).

- [ ] **Step 2: Smoke test agent mode end-to-end**

Start the server, open the UI, enable Agent Mode in Settings, send: `List the files in the current directory`.

Expected:
- ResearchPanel shows agent steps: "Planning agent execution" → "Calling list_files" → "list_files completed" → "Synthesizing answer"
- Chat response contains a file listing

- [ ] **Step 3: Tag Phase 1 complete**

```bash
git tag phase1-complete
```
