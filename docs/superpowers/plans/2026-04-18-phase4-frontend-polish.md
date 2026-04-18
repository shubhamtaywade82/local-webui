# Phase 4: Frontend Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `react-syntax-highlighter` with Shiki, add a dedicated SQL Results panel as the 5th resizable workspace panel, and extend Settings with agent mode controls (already added in Phase 1, here we clean up and complete the UI).

**Architecture:** Shiki is initialized once via `createHighlighter()` in a module-level singleton and shared across all `MarkdownRenderer` instances via a React context. The `SqlResultsPanel` receives `sql_result` WebSocket events via `useSqlResultsStore` (Zustand), renders them as collapsible result tables, and auto-opens on first result. `WorkspaceLayout` adds a 5th panel slot with the same drag-resize hook pattern.

**Tech Stack:** `shiki` (>=1.0), `dompurify` + `@types/dompurify`, `zustand` (already installed in Phase 2).

**Prerequisites:** Phase 1–3 complete and merged.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/lib/highlighter.ts` | Singleton Shiki highlighter init, `highlight(code, lang)` helper |
| Modify | `apps/web/src/components/chat/MarkdownRenderer.tsx` | Swap react-syntax-highlighter for Shiki, sanitize via DOMPurify |
| Create | `apps/web/src/stores/useSqlResultsStore.ts` | Zustand store for SQL results (add, clear, list) |
| Modify | `apps/web/src/stores/useChatStore.tsx` | Handle `sql_result` WS event, push to `useSqlResultsStore` |
| Create | `apps/web/src/components/sql/SqlResultsPanel.tsx` | Results panel with collapsible table per query, CSV export |
| Modify | `apps/web/src/components/layout/WorkspaceLayout.tsx` | Add 5th panel slot for SqlResultsPanel |

---

## Task 1: Install Shiki and DOMPurify

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/web && pnpm add shiki dompurify && pnpm add -D @types/dompurify
```

- [ ] **Step 2: Remove react-syntax-highlighter (after Shiki is wired up in Task 3)**

Do NOT remove it yet — wait until Shiki is wired and working.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json
git commit -m "chore: add shiki and dompurify for syntax highlighting"
```

---

## Task 2: Shiki highlighter singleton

**Files:**
- Create: `apps/web/src/lib/highlighter.ts`

- [ ] **Step 1: Write `apps/web/src/lib/highlighter.ts`**

```typescript
import { createHighlighter, Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;
let initPromise: Promise<Highlighter> | null = null;

const THEMES = ['github-dark', 'github-light', 'tokyo-night', 'dracula'] as const;
export type ShikiTheme = typeof THEMES[number];

const LANGUAGES = [
  'typescript', 'javascript', 'python', 'ruby', 'rust', 'go',
  'sql', 'json', 'yaml', 'bash', 'markdown', 'html', 'css',
  'jsx', 'tsx', 'cpp', 'java', 'csharp', 'php',
];

export function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return Promise.resolve(highlighter);
  if (initPromise) return initPromise;

  initPromise = createHighlighter({
    themes: THEMES,
    langs: LANGUAGES,
  }).then(h => {
    highlighter = h;
    return h;
  });

  return initPromise;
}

export function highlight(code: string, lang: string, theme: ShikiTheme = 'github-dark'): string {
  if (!highlighter) return '';
  try {
    return highlighter.codeToHtml(code, { lang: lang || 'text', theme });
  } catch {
    // Unknown language fallback
    return highlighter.codeToHtml(code, { lang: 'text', theme });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/highlighter.ts
git commit -m "feat: add Shiki highlighter singleton with async init and theme support"
```

---

## Task 3: Replace react-syntax-highlighter with Shiki in MarkdownRenderer

**Files:**
- Modify: `apps/web/src/components/chat/MarkdownRenderer.tsx`

- [ ] **Step 1: Read current `MarkdownRenderer.tsx`**

Read the file to understand what it currently imports and renders.

- [ ] **Step 2: Rewrite `MarkdownRenderer.tsx` to use Shiki**

Replace the file content:

```tsx
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { getHighlighter, highlight, ShikiTheme } from '../../lib/highlighter';

interface Props {
  content: string;
  theme?: ShikiTheme;
}

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  theme: ShikiTheme;
}

function CodeBlock({ inline, className, children, theme }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const code = String(children ?? '').replace(/\n$/, '');
  const lang = (className?.replace('language-', '') ?? 'text');

  useEffect(() => {
    if (inline) return;
    getHighlighter().then(h => {
      try {
        const html = h.codeToHtml(code, { lang, theme });
        setHighlighted(DOMPurify.sanitize(html));
      } catch {
        const html = h.codeToHtml(code, { lang: 'text', theme });
        setHighlighted(DOMPurify.sanitize(html));
      }
    });
  }, [code, lang, theme, inline]);

  if (inline) {
    return (
      <code
        className="px-1.5 py-0.5 rounded text-sm"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
      >
        {children}
      </code>
    );
  }

  if (!highlighted) {
    return (
      <pre className="overflow-x-auto rounded-lg p-4 my-3 text-sm" style={{ background: 'var(--bg-tertiary)', fontFamily: 'var(--font-mono)' }}>
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg my-3 text-sm [&_pre]:p-4 [&_pre]:m-0 [&_.shiki]:rounded-lg"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

export default function MarkdownRenderer({ content, theme = 'github-dark' }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: ({ node, inline, className, children, ...props }: any) => (
          <CodeBlock inline={inline} className={className} theme={theme} {...props}>
            {children}
          </CodeBlock>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 3: Verify in browser**

```bash
pnpm dev
```

Send a chat message that includes a code block, e.g.: "Show me a Python hello world". Expected: code block renders with Shiki syntax highlighting (no error in console).

- [ ] **Step 4: Remove react-syntax-highlighter**

```bash
cd apps/web && pnpm remove react-syntax-highlighter && pnpm remove -D @types/react-syntax-highlighter
```

- [ ] **Step 5: Verify no import errors**

```bash
cd apps/web && pnpm build
```

Expected: TypeScript compiles without errors. No remaining imports of `react-syntax-highlighter`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/MarkdownRenderer.tsx apps/web/package.json
git commit -m "feat: replace react-syntax-highlighter with Shiki for streaming-safe syntax highlighting"
```

---

## Task 4: Add Shiki theme to Settings

**Files:**
- Modify: `apps/web/src/stores/useChatStore.tsx`
- Modify: `apps/web/src/components/layout/SettingsModal.tsx`
- Modify: `apps/web/src/components/chat/MessageBubble.tsx` (or wherever `MarkdownRenderer` is called)

- [ ] **Step 1: Add `shikiTheme` to ChatState in `useChatStore.tsx`**

In `ChatState`, add:
```typescript
shikiTheme: 'github-dark' | 'github-light' | 'tokyo-night' | 'dracula';
```

In initial state:
```typescript
shikiTheme: 'github-dark',
```

In `ChatAction`, add:
```typescript
| { type: 'SET_SHIKI_THEME'; theme: 'github-dark' | 'github-light' | 'tokyo-night' | 'dracula' }
```

In reducer:
```typescript
case 'SET_SHIKI_THEME':
  return { ...state, shikiTheme: action.theme };
```

- [ ] **Step 2: Add theme selector to `SettingsModal.tsx`**

Add local state:
```typescript
const [shikiTheme, setShikiTheme] = useState(state.shikiTheme);
```

Add to `handleSave`:
```typescript
dispatch({ type: 'SET_SHIKI_THEME', theme: shikiTheme });
```

Add the selector UI after the existing Agent settings:

```tsx
{/* Code Theme */}
<div className="space-y-2">
  <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
    Code Highlight Theme
  </label>
  <select
    value={shikiTheme}
    onChange={e => setShikiTheme(e.target.value as any)}
    className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
  >
    <option value="github-dark">GitHub Dark</option>
    <option value="github-light">GitHub Light</option>
    <option value="tokyo-night">Tokyo Night</option>
    <option value="dracula">Dracula</option>
  </select>
</div>
```

- [ ] **Step 3: Pass `shikiTheme` to `MarkdownRenderer`**

Find where `MarkdownRenderer` is rendered (likely in `MessageBubble.tsx`). Pass the theme:

```tsx
const { state } = useChatStore();
// ...
<MarkdownRenderer content={message.content} theme={state.shikiTheme} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/useChatStore.tsx apps/web/src/components/layout/SettingsModal.tsx
git commit -m "feat: add Shiki theme selector in settings, pass theme to MarkdownRenderer"
```

---

## Task 5: SQL results Zustand store

**Files:**
- Create: `apps/web/src/stores/useSqlResultsStore.ts`

- [ ] **Step 1: Write `apps/web/src/stores/useSqlResultsStore.ts`**

```typescript
import { create } from 'zustand';

export interface SqlResult {
  id: string;
  query: string;
  columns: string[];
  rows: string[][];
  durationMs: number;
  timestamp: number;
  conversationId?: string;
}

interface SqlResultsState {
  results: SqlResult[];
  addResult: (result: Omit<SqlResult, 'id' | 'timestamp'>) => void;
  clearResults: () => void;
}

function parseResultText(resultText: string): { columns: string[]; rows: string[][] } {
  const lines = resultText.split('\n').filter(l => l.trim());
  if (lines.length < 3) {
    return { columns: ['result'], rows: [[resultText]] };
  }
  const columns = lines[0].split(' | ').map(c => c.trim());
  const dataLines = lines.slice(2); // skip header and separator line
  const rows = dataLines
    .filter(l => !l.startsWith('(') && l.trim())
    .map(l => l.split(' | ').map(c => c.trim()));
  return { columns, rows };
}

export const useSqlResultsStore = create<SqlResultsState>((set) => ({
  results: [],

  addResult: (result) => {
    const { columns, rows } = result.columns.length > 0
      ? { columns: result.columns, rows: result.rows }
      : parseResultText(String(result.rows));

    set(state => ({
      results: [{
        ...result,
        columns,
        rows,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }, ...state.results].slice(0, 50) // keep last 50 results
    }));
  },

  clearResults: () => set({ results: [] }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/stores/useSqlResultsStore.ts
git commit -m "feat: add useSqlResultsStore for SQL query results"
```

---

## Task 6: Handle sql_result WS events in useChatStore

**Files:**
- Modify: `apps/web/src/stores/useChatStore.tsx`

- [ ] **Step 1: Import and use useSqlResultsStore**

Add import at the top of `useChatStore.tsx`:
```typescript
import { useSqlResultsStore } from './useSqlResultsStore';
```

In the WebSocket `onmessage` handler, find the big `if/else if` chain on `data.type`. Add a new branch:

```typescript
} else if (data.type === 'sql_result') {
  useSqlResultsStore.getState().addResult({
    query: data.query || '',
    columns: [],
    rows: [[data.result || '']],
    durationMs: data.durationMs || 0,
    conversationId: data.conversation_id,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/stores/useChatStore.tsx
git commit -m "feat: handle sql_result WS events and push to useSqlResultsStore"
```

---

## Task 7: SqlResultsPanel component

**Files:**
- Create: `apps/web/src/components/sql/SqlResultsPanel.tsx`

- [ ] **Step 1: Write `apps/web/src/components/sql/SqlResultsPanel.tsx`**

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, Trash2 } from 'lucide-react';
import { useSqlResultsStore, SqlResult } from '../../stores/useSqlResultsStore';

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function downloadCsv(result: SqlResult): void {
  const header = result.columns.join(',');
  const rows = result.rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `query-result-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ResultCard({ result }: { result: SqlResult }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden mb-3" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <code className="text-xs block truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {result.query}
          </code>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {result.rows.length} rows
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {result.durationMs}ms
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {formatRelativeTime(result.timestamp)}
            </span>
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); downloadCsv(result); }}
          className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
          title="Download CSV"
          style={{ color: 'var(--text-muted)' }}
        >
          <Download size={13} />
        </button>
      </div>

      {/* Table */}
      {!collapsed && result.columns.length > 0 && (
        <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {result.columns.map(col => (
                  <th key={col} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 100).map((row, i) => (
                <tr
                  key={i}
                  className="border-t hover:bg-white/5 transition-colors"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5 max-w-[200px] truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {result.rows.length > 100 && (
                <tr>
                  <td colSpan={result.columns.length} className="px-3 py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                    Showing 100 of {result.rows.length} rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw text fallback when no columns parsed */}
      {!collapsed && result.columns.length === 0 && (
        <pre className="px-3 py-2 text-xs overflow-x-auto border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {String(result.rows)}
        </pre>
      )}
    </div>
  );
}

export default function SqlResultsPanel() {
  const { results, clearResults } = useSqlResultsStore();

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b flex-shrink-0" style={{ height: 'var(--header-height)', borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>SQL Results</span>
          {results.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
              {results.length}
            </span>
          )}
        </div>
        {results.length > 0 && (
          <button
            onClick={clearResults}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Clear all results"
            style={{ color: 'var(--text-muted)' }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No SQL results yet</span>
            <span className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Use agent mode and ask a question about your database
            </span>
          </div>
        ) : (
          results.map(result => <ResultCard key={result.id} result={result} />)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/sql/
git commit -m "feat: add SqlResultsPanel with collapsible result tables and CSV export"
```

---

## Task 8: Add SqlResultsPanel as 5th panel in WorkspaceLayout

**Files:**
- Modify: `apps/web/src/components/layout/WorkspaceLayout.tsx`

- [ ] **Step 1: Read full `WorkspaceLayout.tsx`**

Read the current file to understand the full panel layout JSX before modifying.

- [ ] **Step 2: Add sql panel to PANEL_CONFIGS**

Find the `PANEL_CONFIGS` array:
```typescript
const PANEL_CONFIGS: PanelConfig[] = [
  { id: 'sidebar', minWidth: 240, maxWidth: 400, defaultWidth: 280, collapsible: true },
  { id: 'editor', minWidth: 300, maxWidth: 900, defaultWidth: 480, collapsible: true },
  { id: 'research', minWidth: 280, maxWidth: 600, defaultWidth: 380, collapsible: true },
];
```

Replace with:
```typescript
const PANEL_CONFIGS: PanelConfig[] = [
  { id: 'sidebar', minWidth: 240, maxWidth: 400, defaultWidth: 280, collapsible: true },
  { id: 'editor', minWidth: 300, maxWidth: 900, defaultWidth: 480, collapsible: true },
  { id: 'research', minWidth: 280, maxWidth: 600, defaultWidth: 380, collapsible: true },
  { id: 'sql', minWidth: 280, maxWidth: 700, defaultWidth: 400, collapsible: true },
];
```

- [ ] **Step 3: Add SQL panel state and auto-open logic**

Add import:
```typescript
import SqlResultsPanel from '../sql/SqlResultsPanel';
import { useSqlResultsStore } from '../../stores/useSqlResultsStore';
```

Add inside `WorkspaceLayout` after the existing collapsed state variables:
```typescript
const sqlCollapsed = isPanelCollapsed('sql');
const sqlWidth = getPanelWidth('sql');
const sqlResultCount = useSqlResultsStore(s => s.results.length);

// Auto-open SQL panel when first result arrives
useEffect(() => {
  if (sqlResultCount > 0 && sqlCollapsed) {
    toggleCollapse('sql');
  }
}, [sqlResultCount]);
```

- [ ] **Step 4: Add SQL panel JSX**

In the JSX, after the Research panel closing div and before the Editor panel (or after it — match the visual order: Chat → Research → SQL → Editor), add:

```tsx
{/* ── SQL Divider ── */}
{!sqlCollapsed && (
  <div
    className="panel-divider"
    onMouseDown={(e) => startResize('sql', e)}
  />
)}

{/* ── SQL Results Panel ── */}
<div
  className="flex-shrink-0 overflow-hidden transition-all"
  style={{ width: sqlCollapsed ? 0 : sqlWidth, transitionDuration: '300ms' }}
>
  {!sqlCollapsed && <SqlResultsPanel />}
</div>
```

Also add the SQL toggle button to the top bar (find where the existing panel toggle buttons are):

```tsx
<button
  onClick={() => toggleCollapse('sql')}
  className={`panel-toggle-btn ${sqlCollapsed ? 'opacity-40' : ''}`}
  title="Toggle SQL Results"
>
  <Database size={16} />
</button>
```

Add `Database` to the lucide-react import at the top of the file.

- [ ] **Step 5: Verify in browser**

```bash
pnpm dev
```

Open `http://localhost:5173`. Expected: SQL Results panel toggle button visible in top bar. Enable Agent Mode, ask: "How many conversations are in the database?". Expected: SQL Results panel auto-opens when the `query_database` tool fires, showing the query and result table.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/layout/WorkspaceLayout.tsx
git commit -m "feat: add SQL Results as 5th resizable panel in WorkspaceLayout, auto-opens on first result"
```

---

## Task 9: Final cleanup and regression check

- [ ] **Step 1: Full build check**

```bash
pnpm build
```

Expected: all workspaces build without TypeScript errors.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: all tests pass (agent-runtime, tools, auth, telemetry).

- [ ] **Step 3: Browser smoke test — golden path**

1. Open `http://localhost:5173`
2. Login
3. Verify all 5 panels accessible (Sidebar, Chat, Research, SQL Results, Editor)
4. Send a regular chat message — verify Shiki syntax highlighting on code blocks
5. Change code theme in Settings — verify highlighting updates
6. Enable Agent Mode, send: "List the files in the current directory" — verify agent steps in Research panel
7. Enable Agent Mode, ask a DB question — verify SQL Results panel auto-opens with result table
8. Download CSV from a SQL result — verify file downloads

- [ ] **Step 4: Tag Phase 4 complete**

```bash
git tag phase4-complete
```

- [ ] **Step 5: Merge to master**

```bash
git checkout master
git merge feature/chat-agent-coding
git push origin master
```
