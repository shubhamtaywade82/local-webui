import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface SqlResult {
  id: string;
  query: string;
  result: unknown;
  durationMs?: number;
  timestamp: number;
  conversationId?: string;
}

interface SqlResultsContextValue {
  results: SqlResult[];
  addResult: (result: Omit<SqlResult, 'id' | 'timestamp'>) => void;
  clearResults: () => void;
}

const SqlResultsContext = createContext<SqlResultsContextValue | null>(null);

export function useSqlResultsStore(): SqlResultsContextValue {
  const ctx = useContext(SqlResultsContext);
  if (!ctx) throw new Error('useSqlResultsStore must be used within SqlResultsProvider');
  return ctx;
}

export function SqlResultsProvider({ children }: { children: React.ReactNode }) {
  const [results, setResults] = useState<SqlResult[]>([]);

  const addResult = useCallback((r: Omit<SqlResult, 'id' | 'timestamp'>) => {
    setResults(prev => [
      { ...r, id: crypto.randomUUID(), timestamp: Date.now() },
      ...prev
    ].slice(0, 50));
  }, []);

  const clearResults = useCallback(() => setResults([]), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent).detail;
      addResult({
        query: data.query ?? '',
        result: data.result,
        durationMs: data.durationMs,
        conversationId: data.conversation_id,
      });
    };
    window.addEventListener('sql:result', handler);
    return () => window.removeEventListener('sql:result', handler);
  }, [addResult]);

  return (
    <SqlResultsContext.Provider value={{ results, addResult, clearResults }}>
      {children}
    </SqlResultsContext.Provider>
  );
}
