import { useEffect, useState } from 'react';
import {
  Bot, User, ChevronDown, ChevronRight, Brain, Clock, Copy, Check
} from 'lucide-react';
import { type Message } from '../../stores/useChatStore';
import { useEditorStore } from '../../stores/useEditorStore';
import MarkdownRenderer from './MarkdownRenderer';
import {
  formatAssistantAgentOutput,
  looksLikeAgentEnvelope,
  extractAgentFinishThought,
} from '@workspace/agent-runtime/extractFinishAnswer';

const THINK_OPEN = '<' + 'redacted_thinking' + '>';
const THINK_CLOSE = '<' + '/' + 'redacted_thinking' + '>';
/** Legacy alias some models still emit (older prompts / Ollama wrappers). */
const LEGACY_THINK_OPEN = '<' + 'think' + '>';
const LEGACY_THINK_CLOSE = '<' + '/' + 'think' + '>';
/** DeepSeek-style chain-of-thought tags (distinct from short `<think>`). */
const REASONING_OPEN = '<' + 'reason' + 'ing' + '>';
const REASONING_CLOSE = '<' + '/' + 'reason' + 'ing' + '>';
/** Harmony-style handoff from analysis/reasoning to user-visible final channel. */
const HARMONY_FINAL_MARKERS = [
  '<|start|>assistant<|channel|>final<|message|>',
  '<|channel|>final<|message|>',
] as const;

function findThinkingOpen(raw: string): { idx: number; len: number } | null {
  let best: { idx: number; len: number } | null = null;
  for (const [needle, len] of [
    [THINK_OPEN, THINK_OPEN.length] as const,
    [LEGACY_THINK_OPEN, LEGACY_THINK_OPEN.length] as const,
    [REASONING_OPEN, REASONING_OPEN.length] as const,
  ]) {
    const i = raw.indexOf(needle);
    if (i !== -1 && (best === null || i < best.idx)) best = { idx: i, len };
  }
  return best;
}

function findThinkingEnd(afterOpen: string): { idx: number; len: number } | null {
  let best: { idx: number; len: number } | null = null;
  const needles: string[] = [
    THINK_CLOSE,
    LEGACY_THINK_CLOSE,
    REASONING_CLOSE,
    ...HARMONY_FINAL_MARKERS,
  ];
  for (const needle of needles) {
    const i = afterOpen.indexOf(needle);
    if (i !== -1 && (best === null || i < best.idx)) best = { idx: i, len: needle.length };
  }
  return best;
}

/**
 * Split prompt-style thinking from the answer. Recognizes redacted_thinking / short think / reasoning
 * XML blocks, Harmony final-channel markers, and heading-based fallback while the close tag is still streaming.
 */
function splitRedactedThinking(raw: string): { thinking: string | null; body: string } {
  const open = findThinkingOpen(raw);
  if (!open) return { thinking: null, body: raw };

  const { idx: openIdx, len: openLen } = open;
  const afterOpen = raw.slice(openIdx + openLen);

  const end = findThinkingEnd(afterOpen);
  if (end) {
    const thinking = afterOpen.slice(0, end.idx).trim();
    const body = (raw.slice(0, openIdx) + afterOpen.slice(end.idx + end.len)).trim();
    return { thinking: thinking.length > 0 ? thinking : null, body };
  }

  const headingBreak = afterOpen.match(/\r?\n(?:\r?\n)?(?=#{1,6}\s+\S)/);
  if (headingBreak && headingBreak.index !== undefined && headingBreak.index > 0) {
    const thinking = afterOpen.slice(0, headingBreak.index).trim();
    const rest = afterOpen.slice(headingBreak.index).replace(/^\r?\n+/, '');
    const body = (raw.slice(0, openIdx) + rest).trim();
    return { thinking: thinking.length > 0 ? thinking : null, body };
  }

  // Open tag seen but close not yet (typical while SSE is streaming): keep tail in thinking, not body.
  const thinking = afterOpen;
  const body = raw.slice(0, openIdx).trim();
  return {
    thinking: thinking.length > 0 ? thinking : null,
    body,
  };
}

function ThinkingSection({
  thinkingText,
  streaming,
}: {
  thinkingText: string;
  /** While tokens arrive, keep the panel expanded so thinking is visible without an extra click. */
  streaming?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (streaming) setIsOpen(true);
  }, [streaming]);
  const expanded = streaming || isOpen;
  const thinkContent = thinkingText.trim();
  if (!thinkContent) return null;

  return (
    <div
      className="mb-3 rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}
    >
      <button
        onClick={() => !streaming && setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 transition-colors hover:bg-white/[0.02] group"
      >
        <div className="flex items-center gap-1.5">
          <Brain size={12} style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Thinking Process
          </span>
          {streaming && (
            <span className="text-[9px] font-medium normal-case tracking-normal" style={{ color: 'var(--accent)' }}>
              · streaming
            </span>
          )}
        </div>
        {expanded
          ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
        }
      </button>
      {expanded && (
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
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const { openFile } = useEditorStore();
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { thinking: splitThinking, body: bodyAfterThinking } = !isUser
    ? splitRedactedThinking(message.content)
    : { thinking: null as string | null, body: message.content };

  const agentJsonThought =
    !isUser && looksLikeAgentEnvelope(message.content) ? extractAgentFinishThought(message.content) : null;

  const displayThinking =
    splitThinking && splitThinking.length > 0 ? splitThinking : agentJsonThought?.trim() || null;
  const showThinking = !isUser && Boolean(displayThinking);

  const cleanContent = bodyAfterThinking.trim();

  const assistantMarkdownSource =
    !isUser && looksLikeAgentEnvelope(cleanContent)
      ? formatAssistantAgentOutput(cleanContent)
      : cleanContent;

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
              {showThinking && displayThinking && (
                <ThinkingSection
                  thinkingText={displayThinking}
                  streaming={Boolean(message.isStreaming)}
                />
              )}

              {/* Markdown Content */}
              <div className="prose-dark text-sm">
                <MarkdownRenderer content={assistantMarkdownSource} />
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
          {!isUser && !message.isStreaming && assistantMarkdownSource && (
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
