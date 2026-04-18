import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileCode2, X, Plus, Terminal, Settings2,
  ChevronRight, Folder, File, Code2
} from 'lucide-react';
import { useEditorStore } from '../../stores/useEditorStore';

// ── Simple CodeMirror-like editor (pure textarea with line numbers) ──
// CodeMirror 6 integration requires separate npm install step.
// This is a fully functional editor that will be enhanced when CM deps are added.

function LineNumberedEditor({
  content,
  language,
  onChange
}: {
  content: string;
  language: string;
  onChange: (content: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const lines = content.split('\n');

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#1a1a2e' }}>
      {/* Line Numbers */}
      <div
        ref={lineNumbersRef}
        className="flex-shrink-0 overflow-hidden select-none py-3 text-right pr-3 pl-2"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          lineHeight: '1.6',
          color: 'var(--text-muted)',
          minWidth: '3rem',
          borderRight: '1px solid var(--border-subtle)',
          background: 'rgba(0,0,0,0.15)'
        }}
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        className="flex-1 resize-none outline-none py-3 px-4"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          lineHeight: '1.6',
          color: 'var(--text-primary)',
          background: 'transparent',
          tabSize: 2,
          caretColor: 'var(--accent)'
        }}
      />
    </div>
  );
}

// ── Sample files for demo ──
const SAMPLE_FILES = [
  {
    path: 'src/main.ts',
    content: `import { createApp } from './app';

const app = createApp();

app.listen(4000, () => {
  console.log('Server running on port 4000');
});`
  },
  {
    path: 'src/app.ts',
    content: `import Fastify from 'fastify';
import cors from '@fastify/cors';

export function createApp() {
  const app = Fastify({ logger: true });
  app.register(cors);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}`
  },
  {
    path: 'README.md',
    content: `# AI Workspace

Local-first AI chat, coding, and research platform.

## Getting Started

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Architecture

- **Frontend**: React + Vite
- **Backend**: Fastify + Ollama
- **Database**: PostgreSQL + pgvector
`
  }
];

export default function CodeEditorPanel() {
  const { files, activeFile, openFile, closeFile, setActiveFile, updateContent } = useEditorStore();
  const [showExplorer, setShowExplorer] = useState(true);

  // Open sample files on first mount if no files are open
  useEffect(() => {
    if (files.length === 0) {
      openFile(SAMPLE_FILES[0].path, SAMPLE_FILES[0].content);
    }
  }, []);

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
          title="Open file"
          onClick={() => {
            const sample = SAMPLE_FILES.find(s => !files.some(f => f.path === s.path));
            if (sample) openFile(sample.path, sample.content);
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
            className="flex-shrink-0 overflow-y-auto py-2"
            style={{
              width: '180px',
              background: 'var(--bg-tertiary)',
              borderRight: '1px solid var(--border-subtle)'
            }}
          >
            <div className="px-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Explorer
              </span>
            </div>

            {/* Directory Tree */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-white/[0.03]">
                <ChevronRight size={12} style={{ color: 'var(--text-muted)', transform: 'rotate(90deg)' }} />
                <Folder size={12} style={{ color: '#fbbf24' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>src</span>
              </div>

              {SAMPLE_FILES.map(sample => (
                <button
                  key={sample.path}
                  onClick={() => openFile(sample.path, sample.content)}
                  className="w-full flex items-center gap-1 px-2 py-1 pl-6 text-left hover:bg-white/[0.03] transition-colors"
                  style={{
                    background: activeFile?.path === sample.path ? 'var(--accent-muted)' : 'transparent'
                  }}
                >
                  <File size={12} style={{ color: 'var(--text-muted)' }} />
                  <span
                    className="text-[11px] truncate"
                    style={{
                      color: activeFile?.path === sample.path ? 'var(--accent)' : 'var(--text-tertiary)'
                    }}
                  >
                    {sample.path.split('/').pop()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 min-w-0">
          {activeFile ? (
            <LineNumberedEditor
              content={activeFile.content}
              language={activeFile.language}
              onChange={(content) => updateContent(activeFile.id, content)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
              <Code2 size={40} className="mb-3" />
              <p className="text-sm">Open a file to start editing</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Click on a file in the explorer
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
              <span className="font-medium" style={{ color: 'var(--accent)' }}>
                {activeFile.language}
              </span>
              <span>{activeFile.path}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>Spaces: 2</span>
        </div>
      </div>
    </div>
  );
}
