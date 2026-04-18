import { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { Copy, Check, FileDown } from 'lucide-react';
import { useEditorStore } from '../../stores/useEditorStore';
import { highlight, type ShikiTheme } from '../../lib/shiki';
import { useChatStore } from '../../stores/useChatStore';

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ language, code, meta }: { language: string; code: string; meta?: string }) {
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const { files, openFile, updateContent } = useEditorStore();
  const { state } = useChatStore();
  const theme = (state as any).shikiTheme as ShikiTheme ?? 'github-dark';

  useEffect(() => {
    highlight(code, language, theme).then(html => setHighlightedHtml(html));
  }, [code, language, theme]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const parsePath = (metaString?: string) => {
    if (!metaString) return null;
    const match = metaString.match(/path=([^\s]+)/);
    return match ? match[1] : metaString.split(' ')[0];
  };

  const getDisplayPath = () => {
    return parsePath(meta) || `untitled.${language}`;
  };

  const handleApply = () => {
    const path = getDisplayPath();
    openFile(path, code);
    
    // Ensure content is updated if the file was already open
    const existing = files.find(f => f.path === path);
    if (existing) {
      updateContent(existing.id, code);
    }

    // Optional: Dispatch event for UI feedback or other listeners
    window.dispatchEvent(new CustomEvent('editor:tool_call', {
      detail: { path, content: code }
    }));
  };

  return (
    <div className="code-block-wrapper my-4 rounded-xl overflow-hidden border border-white/5 bg-[#0f0f1a] shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a2e] border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[10px] font-mono text-gray-400 opacity-60">
            {getDisplayPath()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md hover:bg-white/5 transition-all text-blue-400 hover:text-blue-300 active:scale-95"
            title="Open/Update in Workspace Editor"
          >
            <FileDown size={12} />
            Apply to Editor
          </button>
          
          <div className="w-px h-3 bg-white/10 mx-1" />

          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md hover:bg-white/5 transition-all active:scale-95 ${copied ? 'text-green-400' : 'text-gray-400 hover:text-gray-300'}`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {highlightedHtml ? (
        <div
          className="shiki-wrapper"
          style={{ fontSize: '0.8rem', lineHeight: '1.6', overflowX: 'auto' }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedHtml) }}
        />
      ) : (
        <pre style={{ margin: 0, padding: '0.75rem 1rem', fontSize: '0.8rem', lineHeight: '1.6', background: '#1a1a2e', overflowX: 'auto' }}>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const code = String(children).replace(/\n$/, '');

          if (!inline && match) {
            return <CodeBlock language={match[1]} code={code} meta={node?.data?.meta} />;
          }

          return (
            <code
              className={className}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85em',
                background: 'var(--bg-surface)',
                padding: '0.15em 0.4em',
                borderRadius: '4px',
                color: 'var(--accent-hover)',
                border: '1px solid var(--border-subtle)'
              }}
              {...props}
            >
              {children}
            </code>
          );
        },

        table({ children }) {
          return (
            <div
              className="overflow-x-auto my-4 rounded-lg"
              style={{ border: '1px solid var(--border-default)' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {children}
              </table>
            </div>
          );
        },

        thead({ children }) {
          return <thead style={{ background: 'var(--bg-tertiary)' }}>{children}</thead>;
        },

        th({ children }) {
          return (
            <th
              style={{
                padding: '0.5em 0.75em',
                textAlign: 'left',
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-default)'
              }}
            >
              {children}
            </th>
          );
        },

        td({ children }) {
          return (
            <td
              style={{
                padding: '0.4em 0.75em',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-subtle)'
              }}
            >
              {children}
            </td>
          );
        },

        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
            >
              {children}
            </a>
          );
        },

        blockquote({ children }) {
          return (
            <blockquote
              style={{
                borderLeft: '3px solid var(--accent)',
                paddingLeft: '1em',
                margin: '0.75em 0',
                color: 'var(--text-secondary)',
                fontStyle: 'italic'
              }}
            >
              {children}
            </blockquote>
          );
        },

        hr() {
          return (
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--border-subtle)',
                margin: '1.5em 0'
              }}
            />
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
