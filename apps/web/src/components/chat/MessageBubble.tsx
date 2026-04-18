import { useState } from 'react';
import {
  Bot, User, ChevronDown, ChevronRight, Brain, Clock, Copy, Check,
  Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import { type Message } from '../../stores/useChatStore';
import { useEditorStore } from '../../stores/useEditorStore';
import MarkdownRenderer from './MarkdownRenderer';

export type InlineAgentStep = {
  id: string;
  label: string;
  tool?: string;
  status: 'running' | 'success' | 'error';
  pendingApproval?: boolean;
};

function InlineAgentActivity({
  steps,
  onAgentApproval
}: {
  steps: InlineAgentStep[];
  onAgentApproval?: (approved: boolean, stepId: string) => void;
}) {
  if (steps.length === 0) return null;

  const statusIcon = (status: InlineAgentStep['status'], animate: boolean) => {
    if (status === 'success') return <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />;
    if (status === 'error') return <XCircle size={12} style={{ color: 'var(--error)' }} />;
    return <Loader2 size={12} className={animate ? 'animate-spin' : ''} style={{ color: 'var(--warning)' }} />;
  };

  return (
    <ul className="mb-3 space-y-1">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`flex items-start gap-2 text-left py-0.5 px-1 rounded-md ${step.status === 'running' ? 'animate-pulse' : ''}`}
        >
          <span className="flex-shrink-0 mt-0.5">{statusIcon(step.status, step.status === 'running')}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {step.label}
            </div>
            {step.pendingApproval && onAgentApproval && (
              <div className="flex gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => onAgentApproval(true, step.id)}
                  className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onAgentApproval(false, step.id)}
                  className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ThinkingSection({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/redacted_thinking>|$)/);
  if (!thinkMatch) return null;
  const thinkContent = thinkMatch[1].trim();
  if (!thinkContent) return null;

  return (
    <div
      className="mb-3 rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 transition-colors hover:bg-white/[0.02] group"
      >
        <div className="flex items-center gap-1.5">
          <Brain size={12} style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Thinking Process
          </span>
        </div>
        {isOpen
          ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
        }
      </button>
      {isOpen && (
        <div
          className="px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap"
          style={{
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '0.5rem',
            fontStyle: 'italic'
          }}
        >
          {thinkContent}
        </div>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  /** Latest assistant reply: show live agent steps from the active conversation */
  inlineAgentSteps?: InlineAgentStep[];
  onAgentApproval?: (approved: boolean, stepId: string) => void;
}

export default function MessageBubble({
  message,
  inlineAgentSteps,
  onAgentApproval
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const { openFile } = useEditorStore();
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cleanContent = message.content
    .replace(/<think>[\s\S]*?(?:<\/redacted_thinking>|$)/g, '')
    .trim();

  return (
    <div
      className={`flex items-start gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: isUser ? 'var(--bg-surface)' : 'var(--accent-muted)',
          border: `1px solid ${isUser ? 'var(--border-subtle)' : 'var(--border-accent)'}`
        }}
      >
        {isUser
          ? <User size={14} style={{ color: 'var(--text-tertiary)' }} />
          : <Bot size={14} style={{ color: 'var(--accent)' }} />
        }
      </div>

      {/* Content */}
      <div className={`max-w-[85%] min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div
          className="relative px-4 py-3 rounded-2xl group"
          style={{
            background: isUser
              ? 'linear-gradient(135deg, var(--accent), #6346d9)'
              : 'var(--bg-elevated)',
            border: isUser ? 'none' : '1px solid var(--border-subtle)',
            borderTopRightRadius: isUser ? '4px' : undefined,
            borderTopLeftRadius: !isUser ? '4px' : undefined,
            color: isUser ? '#fff' : 'var(--text-primary)',
            boxShadow: isUser ? 'var(--shadow-md)' : 'var(--shadow-sm)'
          }}
        >
          {isUser ? (
            <div className="text-sm whitespace-pre-wrap text-left">{message.content}</div>
          ) : (
            <>
              {inlineAgentSteps && inlineAgentSteps.length > 0 && (
                <InlineAgentActivity steps={inlineAgentSteps} onAgentApproval={onAgentApproval} />
              )}

              {message.content.includes('<think>') && (
                <ThinkingSection content={message.content} />
              )}

              {/* Markdown Content */}
              <div className="prose-dark text-sm">
                <MarkdownRenderer content={cleanContent} />
              </div>

              {/* Streaming cursor */}
              {message.isStreaming && (
                <span
                  className="inline-block w-2 h-4 ml-0.5 align-middle"
                  style={{
                    background: 'var(--accent)',
                    animation: 'breathe 1s infinite'
                  }}
                />
              )}

              {/* Sources */}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div
                    className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Sources
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {message.sources.map((source, idx) => (
                      <button
                        key={idx}
                        onClick={() => openFile(source, `// Placeholder content for ${source}\n// Configure backend file streaming in later phases.`)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium hover:bg-white/5 transition-colors cursor-pointer"
                        style={{
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-tertiary)'
                        }}
                      >
                        <span
                          className="w-1 h-1 rounded-full"
                          style={{ background: 'var(--accent)' }}
                        />
                        {source.split('/').pop()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions (assistant only, on hover) */}
          {!isUser && !message.isStreaming && cleanContent && (
            <div className="absolute -bottom-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: copied ? 'var(--success)' : 'var(--text-tertiary)'
                }}
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {/* Timestamp */}
        {message.timestamp && (
          <div className={`flex items-center gap-1 mt-1 ${isUser ? 'justify-end' : ''}`}>
            <Clock size={9} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
