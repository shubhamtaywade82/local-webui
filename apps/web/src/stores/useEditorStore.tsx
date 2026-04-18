import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface EditorFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface EditorState {
  files: EditorFile[];
  activeFileId: string | null;
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  html: 'html', css: 'css', scss: 'css', json: 'json',
  md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'toml',
};

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

function getPersistedEditorState(): EditorState | null {
  try {
    const raw = localStorage.getItem('ai-workspace-editor');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

interface EditorContextValue {
  files: EditorFile[];
  activeFile: EditorFile | null;
  activeFileId: string | null;
  openFile: (path: string, content: string) => void;
  closeFile: (fileId: string) => void;
  setActiveFile: (fileId: string) => void;
  updateContent: (fileId: string, content: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorStore() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorStore must be used within EditorStoreProvider');
  return ctx;
}

export function EditorStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EditorState>(() => {
    return getPersistedEditorState() || {
      files: [],
      activeFileId: null
    };
  });

  useEffect(() => {
    localStorage.setItem('ai-workspace-editor', JSON.stringify(state));
  }, [state]);

  const openFile = useCallback((path: string, content: string) => {
    setState(prev => {
      const existing = prev.files.find(f => f.path === path);
      if (existing) {
        return { ...prev, activeFileId: existing.id };
      }
      const name = path.split('/').pop() ?? path;
      const file: EditorFile = {
        id: crypto.randomUUID(),
        name,
        path,
        content,
        language: detectLanguage(name),
        isDirty: false
      };
      return {
        files: [...prev.files, file],
        activeFileId: file.id
      };
    });
  }, []);

  const closeFile = useCallback((fileId: string) => {
    setState(prev => {
      const remaining = prev.files.filter(f => f.id !== fileId);
      return {
        files: remaining,
        activeFileId:
          prev.activeFileId === fileId
            ? (remaining[remaining.length - 1]?.id ?? null)
            : prev.activeFileId
      };
    });
  }, []);

  const setActiveFile = useCallback((fileId: string) => {
    setState(prev => ({ ...prev, activeFileId: fileId }));
  }, []);

  const updateContent = useCallback((fileId: string, content: string) => {
    setState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.id === fileId ? { ...f, content, isDirty: true } : f
      )
    }));
  }, []);

  const activeFile = state.files.find(f => f.id === state.activeFileId) ?? null;

  return (
    <EditorContext.Provider value={{
      files: state.files,
      activeFile,
      activeFileId: state.activeFileId,
      openFile,
      closeFile,
      setActiveFile,
      updateContent
    }}>
      {children}
    </EditorContext.Provider>
  );
}
