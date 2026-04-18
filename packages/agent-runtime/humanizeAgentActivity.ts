/**
 * Natural-language labels for agent tool lifecycle (running / done / pending approval).
 * Kept free of Node or tool implementations so it stays safe to import from the server only.
 */

function pathPhrase(path: unknown): string {
  const raw = String(path ?? '').trim();
  if (raw === '' || raw === '.') return 'the workspace root';
  return `\`${raw}\``;
}

function clipText(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function withQueryPreview(prefix: string, query: unknown, maxLen: number): string {
  const q = String(query ?? '').trim();
  if (!q) return `${prefix}…`;
  return `${prefix} (“${clipText(q, maxLen)}”)…`;
}

/** Shown while a tool is executing */
export function humanizeToolRunning(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'list_files':
      return `Listing files and folders in ${pathPhrase(args.path)}…`;
    case 'read_file':
      return `Reading ${pathPhrase(args.path)}…`;
    case 'edit_file':
      return `Saving edits to ${pathPhrase(args.path)}…`;
    case 'create_file':
      return `Creating new file ${pathPhrase(args.path)}…`;
    case 'delete_file':
      return `Removing ${pathPhrase(args.path)}…`;
    case 'query_database':
      return 'Running a read-only database query…';
    case 'describe_schema':
      return 'Loading database schema (tables and columns)…';
    case 'search_kb':
      return withQueryPreview('Searching your local knowledge for', args.query, 56);
    case 'ingest_document':
      return `Indexing ${pathPhrase(args.path)} into the knowledge base…`;
    case 'run_code':
      return `Running ${String(args.language ?? 'code').toLowerCase()} in an isolated sandbox…`;
    case 'web_search':
      return withQueryPreview('Searching the web for', args.query, 48);
    case 'fetch_url':
      return `Fetching content from ${pathPhrase(args.url)}…`;
    case 'finish':
      return 'Drafting the final answer from gathered notes…';
    default:
      return `Running “${tool}”…`;
  }
}

/** Shown after a tool returns */
export function humanizeToolDone(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'list_files':
      return `Listed the contents of ${pathPhrase(args.path)}.`;
    case 'read_file':
      return `Read ${pathPhrase(args.path)}.`;
    case 'edit_file':
      return `Saved changes to ${pathPhrase(args.path)}.`;
    case 'create_file':
      return `Created ${pathPhrase(args.path)}.`;
    case 'delete_file':
      return `Deleted ${pathPhrase(args.path)}.`;
    case 'query_database':
      return 'Database query finished.';
    case 'describe_schema':
      return 'Database layout is ready to use.';
    case 'search_kb':
      return `Knowledge search finished (“${clipText(String(args.query ?? ''), 48)}”).`;
    case 'ingest_document':
      return `Indexed ${pathPhrase(args.path)}.`;
    case 'run_code':
      return `${String(args.language ?? 'Code')} run finished.`;
    case 'web_search':
      return 'Web search step finished.';
    case 'fetch_url':
      return `Fetched ${pathPhrase(args.url)}.`;
    case 'finish':
      return 'Answer is ready to stream.';
    default:
      return `Finished “${tool}”.`;
  }
}

/** Step mode: one line before Approve / Reject (no trailing question; buttons carry the action) */
export function humanizePendingStepLabel(toolName: string, toolInput: Record<string, unknown>): string {
  return humanizeToolRunning(toolName, toolInput).replace(/…\s*$/, '').trim();
}
