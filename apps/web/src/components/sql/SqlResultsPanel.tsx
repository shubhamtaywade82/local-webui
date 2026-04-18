import { Database, Trash2, Clock } from 'lucide-react';
import { useSqlResultsStore, type SqlResult } from '../../stores/useSqlResultsStore';

function ResultTable({ result }: { result: unknown }) {
  if (!result) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No rows returned.</p>;

  if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
    const cols = Object.keys(result[0] as Record<string, unknown>);
    return (
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)' }}>
              {cols.map(c => (
                <th key={c} style={{ padding: '0.4em 0.75em', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(result as Record<string, unknown>[]).map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {cols.map(c => (
                  <td key={c} style={{ padding: '0.35em 0.75em', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="text-xs rounded-lg p-3 overflow-x-auto" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function SqlResultCard({ item }: { item: SqlResult }) {
  const ts = new Date(item.timestamp).toLocaleTimeString();
  return (
    <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs flex-1 truncate" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          {item.query}
        </code>
        <div className="flex items-center gap-1 flex-shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <Clock size={10} />
          {item.durationMs != null ? `${item.durationMs}ms` : ts}
        </div>
      </div>
      <ResultTable result={item.result} />
    </div>
  );
}

export default function SqlResultsPanel() {
  const { results, clearResults } = useSqlResultsStore();

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2">
          <Database size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>SQL Results</span>
          {results.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
              {results.length}
            </span>
          )}
        </div>
        {results.length > 0 && (
          <button
            onClick={clearResults}
            className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
            title="Clear results"
          >
            <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Database size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              SQL query results will appear here when the agent runs database queries.
            </p>
          </div>
        ) : (
          results.map(r => <SqlResultCard key={r.id} item={r} />)
        )}
      </div>
    </div>
  );
}
