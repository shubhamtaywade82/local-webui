import { useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { Sparkles, ArrowRight, BookOpen, Code2, Brain, BarChart3 } from 'lucide-react';

const SUGGESTIONS = [
  { label: 'Check Knowledge', prompt: 'What documents are available in my local knowledge base?', icon: BookOpen, color: '#60a5fa' },
  { label: 'Analyze Code', prompt: 'Can you explain how the Sequelize models are defined in this project?', icon: Code2, color: '#34d399' },
  { label: 'Test Thinking', prompt: 'Solve this step by step: What is the sum of all prime numbers less than 50?', icon: Brain, color: '#a78bfa' },
  { label: 'Data Tasks', prompt: 'Show me a sample SQL table for tracking user preferences.', icon: BarChart3, color: '#fbbf24' },
];

export default function ChatPanel() {
  const { state, activeConversation, sendMessage, createNewConversation } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = activeConversation?.messages ?? [];
  const isStreaming = state.streamingState === 'streaming' || state.streamingState === 'thinking';
  const showWelcome = messages.length === 0;

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, messages[messages.length - 1]?.content, activeConversation?.agentSteps?.length]);

  const handleSuggestion = (prompt: string) => {
    if (!activeConversation) createNewConversation();
    setTimeout(() => sendMessage(prompt), 50);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          {showWelcome ? (
            /* ── Welcome Screen ── */
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] animate-fade-in">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-muted), rgba(124, 93, 250, 0.05))',
                  border: '1px solid var(--border-accent)',
                  boxShadow: 'var(--shadow-glow)'
                }}
              >
                <Sparkles size={28} style={{ color: 'var(--accent)' }} />
              </div>

              <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                AI Workspace
              </h1>
              <p className="text-sm mb-8 text-center max-w-md" style={{ color: 'var(--text-tertiary)' }}>
                Your local-first AI assistant with RAG support. Ask anything, write code, or explore your knowledge base.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTIONS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSuggestion(s.prompt)}
                      className="glass-card flex items-start gap-3 px-4 py-3 text-left group transition-all hover:scale-[1.02] hover:border-[var(--border-accent)]"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `${s.color}15` }}
                      >
                        <Icon size={15} style={{ color: s.color }} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
                          {s.label}
                        </div>
                        <div className="text-[11px] leading-relaxed truncate-2" style={{ color: 'var(--text-muted)' }}>
                          {s.prompt}
                        </div>
                      </div>
                      <ArrowRight
                        size={14}
                        className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── Message List ── */
            <div className="space-y-4 pb-4">
              {messages.map((msg) => {
                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                  />
                );
              })}

              {/* Thinking Indicator */}
              {state.streamingState === 'thinking' && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex items-start gap-3 animate-fade-in">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--accent-muted)' }}
                  >
                    <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div
                    className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: 'var(--accent)',
                            animation: `pulse-dot 1.2s infinite ${i * 200}ms`
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        isDisabled={isStreaming}
        model={state.model}
        providerMode={state.providerMode}
      />
    </div>
  );
}
