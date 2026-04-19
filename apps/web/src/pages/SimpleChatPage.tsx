import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import type { Message, ProviderMode } from '../stores/useChatStore';

const CONV_KEY = 'simple-chat-conversation-id';

function getAuthToken(): string | null {
  try {
    return JSON.parse(localStorage.getItem('ai-workspace-auth') || '{}').token ?? null;
  } catch {
    return null;
  }
}

function loadChatSettings() {
  try {
    const raw = localStorage.getItem('ai-workspace-settings');
    const s = raw ? JSON.parse(raw) : {};
    const providerMode: ProviderMode = s.providerMode === 'cloud' ? 'cloud' : 'local';
    const model =
      providerMode === 'cloud'
        ? s.providerModels?.cloud || 'gpt-oss:20b'
        : s.providerModels?.local || s.model || 'llama3.2:3b';
    return { providerMode, model, thinking: Boolean(s.isThinkingEnabled) };
  } catch {
    return { providerMode: 'local' as ProviderMode, model: 'llama3.2:3b', thinking: false };
  }
}

export default function SimpleChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingState, setStreamingState] = useState<'idle' | 'streaming' | 'thinking' | 'error'>('idle');
  const [thinking, setThinking] = useState(() => loadChatSettings().thinking);
  const settings = loadChatSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string>(
    sessionStorage.getItem(CONV_KEY) ||
      (() => {
        const id = crypto.randomUUID();
        sessionStorage.setItem(CONV_KEY, id);
        return id;
      })()
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streamingState === 'streaming' || streamingState === 'thinking') return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      const threadForApi = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreamingState('thinking');

      const token = getAuthToken();
      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/chat/`
      );

      setStreamingState('streaming');

      ws.onopen = () => {
        const { model, providerMode } = loadChatSettings();
        ws.send(
          JSON.stringify({
            provider: providerMode,
            model,
            messages: threadForApi,
            thinking,
            conversation_id: convIdRef.current,
            agentMode: false,
            simpleChat: true,
            includeConversationHistory: false,
            maxIterations: 1,
            agentStepMode: 'auto',
            token: token || undefined,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'token') {
            const t = String(data.token ?? '');
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + t } : m))
            );
          } else if (data.type === 'done') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
            );
            setStreamingState('idle');
            ws.close();
          } else if (data.type === 'error') {
            const err = String(data.error ?? 'Unknown error');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: m.content + `\n\n**Stream error:** ${err}`,
                      isStreaming: false,
                    }
                  : m
              )
            );
            setStreamingState('idle');
            ws.close();
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setStreamingState('idle');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + '\n\n**Connection error**', isStreaming: false }
              : m
          )
        );
      };
    },
    [messages, streamingState, thinking]
  );

  const isBusy = streamingState === 'streaming' || streamingState === 'thinking';
  const showWelcome = messages.length === 0;

  const newThread = () => {
    const id = crypto.randomUUID();
    sessionStorage.setItem(CONV_KEY, id);
    convIdRef.current = id;
    setMessages([]);
    setStreamingState('idle');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <header
        className="flex items-center justify-between px-4 flex-shrink-0 border-b"
        style={{
          height: 'var(--header-height)',
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="p-1.5 rounded-md hover:bg-white/5 transition-colors flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            title="Back to workspace"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Simple chat
            </div>
            <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
              Streaming only · no tools or agent loop · route <code className="text-[10px]">/chst</code>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={thinking}
              onChange={(e) => setThinking(e.target.checked)}
              disabled={isBusy}
            />
            Thinking tags
          </label>
          <button
            type="button"
            onClick={newThread}
            disabled={isBusy}
            className="text-[11px] px-2 py-1 rounded-md hover:bg-white/5 disabled:opacity-40"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            New thread
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          {showWelcome ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] animate-fade-in">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-muted), rgba(124, 93, 250, 0.05))',
                  border: '1px solid var(--border-accent)',
                }}
              >
                <Sparkles size={26} style={{ color: 'var(--accent)' }} />
              </div>
              <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                Simple chat
              </h1>
              <p className="text-sm text-center max-w-md mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Direct LLM streaming with optional thinking-mode tags. Model and provider follow your saved workspace
                settings.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ChatInput
        onSend={sendMessage}
        isDisabled={isBusy}
        model={settings.model}
        providerMode={settings.providerMode}
      />
    </div>
  );
}
