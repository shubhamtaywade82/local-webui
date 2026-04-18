import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { ProviderMode } from '../../stores/useChatStore';

interface ChatInputProps {
  onSend: (content: string) => void;
  isDisabled: boolean;
  model: string;
  providerMode: ProviderMode;
}

export default function ChatInput({ onSend, isDisabled, model, providerMode }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isDisabled) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 md:p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="max-w-3xl mx-auto">
        <div
          className="relative rounded-2xl overflow-hidden transition-all"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            boxShadow: input.trim() ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
            borderColor: input.trim() ? 'var(--border-accent)' : 'var(--border-default)'
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="w-full resize-none outline-none text-sm px-4 py-3 pr-24"
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              maxHeight: '180px'
            }}
            disabled={isDisabled}
          />

          {/* Bottom Bar */}
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-1">
              <span
                className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                {providerMode === 'cloud' ? 'Cloud' : 'Local'} · {model}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSend}
                disabled={!input.trim() || isDisabled}
                className="flex items-center justify-center w-8 h-8 rounded-xl transition-all"
                style={{
                  background: input.trim() && !isDisabled
                    ? 'linear-gradient(135deg, var(--accent), #6346d9)'
                    : 'var(--bg-surface)',
                  color: input.trim() && !isDisabled ? '#fff' : 'var(--text-muted)',
                  cursor: !input.trim() || isDisabled ? 'not-allowed' : 'pointer',
                  opacity: !input.trim() || isDisabled ? 0.5 : 1,
                  boxShadow: input.trim() && !isDisabled ? 'var(--shadow-glow)' : 'none'
                }}
              >
                {isDisabled ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
          </div>
        </div>

        <div
          className="text-center text-[10px] mt-2"
          style={{ color: 'var(--text-muted)' }}
        >
          AI can make mistakes. Consider verifying important information.
        </div>
      </div>
    </div>
  );
}
