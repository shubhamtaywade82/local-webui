import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface EditorFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
  isSaving?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
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
  tree: FileNode[];
  loadingTree: boolean;
  activeFile: EditorFile | null;
  activeFileId: string | null;
  openFile: (path: string, content: string) => void;
  closeFile: (fileId: string) => void;
  setActiveFile: (fileId: string) => void;
  updateContent: (fileId: string, content: string) => void;
  saveFile: (fileId: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  openFromDisk: (path: string) => Promise<void>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorStore() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorStore must be used within EditorStoreProvider');
  return ctx;
}

export function EditorStoreProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<EditorState>(() => {
    return getPersistedEditorState() || {
      files: [],
      activeFileId: null
    };
  });

  const [tree, setTree] = useState<FileNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);

  useEffect(() => {
    localStorage.setItem('ai-workspace-editor', JSON.stringify(state));
  }, [state]);

  const refreshTree = useCallback(async () => {
    setLoadingTree(true);
    try {
      const res = await fetch('/api/files/list');
      if (res.ok) {
        const data = await res.json();
        setTree(data.tree || []);
      }
    } catch (err) {
      console.error('Failed to fetch file tree:', err);
    } finally {
      setLoadingTree(false);
    }
  }, []);

  // Initial tree load
  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

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
        isDirty: true
      };
      return {
        files: [...prev.files, file],
        activeFileId: file.id
      };
    });
  }, []);

  const openFromDisk = useCallback(async (path: string) => {
    // Check if already open
    const existing = state.files.find(f => f.path === path);
    if (existing) {
      setState(prev => ({ ...prev, activeFileId: existing.id }));
      return;
    }

    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const { content } = await res.json();
        const name = path.split('/').pop() ?? path;
        const file: EditorFile = {
          id: crypto.randomUUID(),
          name,
          path,
          content,
          language: detectLanguage(name),
          isDirty: false
        };
        setState(prev => ({
          files: [...prev.files, file],
          activeFileId: file.id
        }));
      }
    } catch (err) {
      console.error('Failed to read file from disk:', err);
    }
  }, [state.files]);

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

  const saveFile = useCallback(async (fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;

    setState(prev => ({
      ...prev,
      files: prev.files.map(f => f.id === fileId ? { ...f, isSaving: true } : f)
    }));

    try {
      const res = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path, content: file.content })
      });

      if (!res.ok) throw new Error('Failed to save file');

      setState(prev => ({
        ...prev,
        files: prev.files.map(f => 
          f.id === fileId ? { ...f, isDirty: false, isSaving: false } : f
        )
      }));
      
      // Refresh tree in case it's a new file
      refreshTree();
    } catch (err) {
      console.error(err);
      setState(prev => ({
        ...prev,
        files: prev.files.map(f => f.id === fileId ? { ...f, isSaving: false } : f)
      }));
    }
  }, [state.files, refreshTree]);

  const activeFile = state.files.find(f => f.id === state.activeFileId) ?? null;

  return (
    <EditorContext.Provider value={{
      files: state.files,
      tree,
      loadingTree,
      activeFile,
      activeFileId: state.activeFileId,
      openFile,
      closeFile,
      setActiveFile,
      updateContent,
      saveFile,
      refreshTree,
      openFromDisk
    }}>
      {children}
    </EditorContext.Provider>
  );
}
