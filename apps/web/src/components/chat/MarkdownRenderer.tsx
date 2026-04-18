import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <button
          onClick={handleCopy}
          className={`code-copy-btn ${copied ? 'copied' : ''}`}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          padding: '0.75rem 1rem',
          fontSize: '0.8rem',
          lineHeight: '1.6',
          background: '#1a1a2e'
        }}
      >
        {code}
      </SyntaxHighlighter>
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
            return <CodeBlock language={match[1]} code={code} />;
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
