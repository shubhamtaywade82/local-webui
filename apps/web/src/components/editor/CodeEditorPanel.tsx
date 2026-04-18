import { useState, useEffect } from 'react';
import {
  FileCode2, X, Plus, ChevronRight, Folder, File, Code2, 
  Save, Loader2, RefreshCcw, Search
} from 'lucide-react';
import { useEditorStore, FileNode } from '../../stores/useEditorStore';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

function getLanguageExtension(lang: string) {
  switch (lang) {
    case 'javascript':
    case 'typescript':
      return [javascript({ typescript: true })];
    case 'html':
      return [html()];
    case 'css':
      return [css()];
    case 'json':
      return [json()];
    case 'markdown':
      return [markdown()];
    default:
      return [];
  }
}

function FileTreeItem({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const { openFromDisk, activeFile } = useEditorStore();
  const [isOpen, setIsOpen] = useState(false);
  const isActive = activeFile?.path === node.path;

  if (node.isDir) {
    return (
      <div className="flex flex-col">
        <div
          className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-white/[0.03] transition-colors group"
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronRight
            size={12}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            style={{ color: 'var(--text-muted)' }}
          />
          <Folder size={12} style={{ color: '#fbbf24' }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            {node.name}
          </span>
        </div>
        {isOpen && node.children?.map(child => (
          <FileTreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => openFromDisk(node.path)}
      className="w-full flex items-center gap-1.5 px-3 py-1 text-left hover:bg-white/[0.03] transition-colors group"
      style={{
        paddingLeft: `${depth * 12 + 28}px`,
        background: isActive ? 'var(--accent-muted)' : 'transparent'
      }}
    >
      <File size={12} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
      <span
        className="text-[11px] truncate flex-1"
        style={{
          color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
          fontWeight: isActive ? 600 : 400
        }}
      >
        {node.name}
      </span>
    </button>
  );
}

export default function CodeEditorPanel() {
  const { 
    files, activeFile, openFile, closeFile, setActiveFile, updateContent,
    tree, loadingTree, saveFile, refreshTree, openFromDisk
  } = useEditorStore();
  const [showExplorer, setShowExplorer] = useState(true);

  // Keyboard Shortcuts: Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeFile) {
          saveFile(activeFile.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, saveFile]);

  // Listen for AI tool calls
  useEffect(() => {
    const handleToolCall = (event: any) => {
      const { path, content } = event.detail;
      console.log(`[CodeEditorPanel] AI Tool Call: Editing ${path}`);
      openFile(path, content);
      
      const existing = files.find(f => f.path === path);
      if (existing) {
        updateContent(existing.id, content);
      }
    };

    window.addEventListener('editor:tool_call', handleToolCall);
    return () => window.removeEventListener('editor:tool_call', handleToolCall);
  }, [files, openFile, updateContent]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-subtle)' }}>
      {/* ── Tab Bar ── */}
      <div
        className="flex items-center gap-0 overflow-x-auto no-scrollbar flex-shrink-0"
        style={{
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-subtle)',
          minHeight: '36px'
        }}
      >
        {files.map(file => {
          const isActive = file.id === activeFile?.id;
          return (
            <div
              key={file.id}
              className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer group transition-colors flex-shrink-0"
              style={{
                background: isActive ? 'var(--bg-secondary)' : 'transparent',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                borderRight: '1px solid var(--border-subtle)'
              }}
              onClick={() => setActiveFile(file.id)}
            >
              <FileCode2 size={12} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
              <span
                className="text-[11px] font-medium"
                style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              >
                {file.name}
              </span>
              {file.isDirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--accent)' }}
                  title="Unsaved changes"
                />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); closeFile(file.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all"
              >
                <X size={10} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          );
        })}

        {/* New Tab Button */}
        <button
          className="p-2 hover:bg-white/5 transition-colors"
          title="New untitled file"
          onClick={() => {
            const id = crypto.randomUUID();
            openFile(`workspace/untitled-${id.slice(0, 4)}.txt`, '');
          }}
        >
          <Plus size={12} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* ── Editor Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer */}
        {showExplorer && (
          <div
            className="flex-shrink-0 overflow-y-auto"
            style={{
              width: '200px',
              background: 'var(--bg-tertiary)',
              borderRight: '1px solid var(--border-subtle)'
            }}
          >
            <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Workspace
              </span>
              <button 
                onClick={refreshTree}
                className={`p-1 rounded hover:bg-white/5 transition-colors ${loadingTree ? 'animate-spin' : ''}`}
                title="Refresh workspace explorer"
              >
                <RefreshCcw size={10} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            {/* Directory Tree */}
            <div className="py-2">
              {tree.length === 0 && !loadingTree && (
                <div className="px-4 py-8 text-center">
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Workspace is empty.
                  </p>
                </div>
              )}
              {tree.map(node => (
                <FileTreeItem key={node.path} node={node} />
              ))}
            </div>
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          {activeFile ? (
            <>
              {/* Editor Header / Path Bar */}
              <div 
                className="flex items-center justify-between px-4 py-1.5 border-b"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  <span>{activeFile.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveFile(activeFile.id)}
                    disabled={!activeFile.isDirty || activeFile.isSaving}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 disabled:opacity-30 disabled:grayscale disabled:scale-100"
                    style={{
                      background: activeFile.isDirty ? 'var(--accent)' : 'transparent',
                      color: activeFile.isDirty ? '#fff' : 'var(--text-muted)',
                      border: activeFile.isDirty ? 'none' : '1px solid var(--border-subtle)'
                    }}
                  >
                    {activeFile.isSaving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    {activeFile.isSaving ? 'Saving...' : 'Save to Disk'}
                  </button>
                </div>
              </div>

              <CodeMirror
                value={activeFile.content}
                height="100%"
                theme={oneDark}
                extensions={getLanguageExtension(activeFile.language)}
                onChange={(value) => updateContent(activeFile.id, value)}
                className="flex-1 [&>.cm-editor]:h-full text-[13px] font-mono overflow-hidden"
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
              <Code2 size={40} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a file to edit</p>
              <p className="text-[11px] mt-1 opacity-60">
                Explore the workspace sidebar or create a new file
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div
        className="flex items-center justify-between px-3 py-1 flex-shrink-0 text-[10px]"
        style={{
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)'
        }}
      >
        <div className="flex items-center gap-3">
          {activeFile && (
            <>
              <span className="font-bold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                <span className="w-1 h-1 rounded-full bg-current" />
                {activeFile.language.toUpperCase()}
              </span>
              <span className="opacity-60">{activeFile.content.length} characters</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 opacity-60">
          <span>UTF-8</span>
          <span>LN, COL</span>
        </div>
      </div>
    </div>
  );
}
