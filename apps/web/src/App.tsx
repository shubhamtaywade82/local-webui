import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, LayoutDashboard, Settings, Menu, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export default function App() {
  const [model, setModel] = useState('llama3.2:3b');
  const [models] = useState([
    'llama3.2:3b',
    'qwen3.5:4b',
    'qwen2.5:0.5b',
    'deepseek-coder:6.7b'
  ]);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your local AI workspace with RAG support. How can I help you today?' }
  ]);
  
  const SUGGESTIONS = [
    { label: "Check Knowledge", prompt: "What documents are available in my local knowledge base?", icon: "📚" },
    { label: "Analyze Code", prompt: "Can you explain how the Sequelize models are defined in this project?", icon: "💻" },
    { label: "Compare Models", prompt: "What are the strengths of llama3.2 versus qwen2.5 for local tasks?", icon: "⚖️" },
    { label: "Data Tasks", prompt: "Show me a sample SQL table for tracking user preferences.", icon: "📊" }
  ];

  const applySuggestion = (p: string) => {
    setInput(p);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  async function send() {
    if (!input.trim() || isTyping) return;
    
    const newMessages: Message[] = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model, // Using selected model
          messages: newMessages
        })
      });

      if (!res.ok) {
        const text = await res.text();
        setMessages(m => [...m, { role: 'assistant', content: `\n\n**Error:** Backend returned ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}` }]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setMessages(m => [...m, { role: 'assistant', content: '\n\n**Error:** Server returned no response body.' }]);
        return;
      }

      setMessages(m => [...m, { role: 'assistant', content: '' }]);
      
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              setMessages(m => {
                const next = [...m];
                const lastIdx = next.length - 1;
                if (lastIdx >= 0) {
                  next[lastIdx] = { ...next[lastIdx], content: next[lastIdx].content + data.token };
                }
                return next;
              });
            }
          } catch (err) {
            // Ignore malformed JSON chunks
          }
        }
      }
      if (buffer.trim()) {
        if (buffer.startsWith('data: ')) {
          try {
            const data = JSON.parse(buffer.slice(6));
            if (data.token) {
              setMessages(m => {
                const next = [...m];
                const lastIdx = next.length - 1;
                if (lastIdx >= 0) {
                  next[lastIdx] = { ...next[lastIdx], content: next[lastIdx].content + data.token };
                }
                return next;
              });
            }
          } catch (err) {
            // ignore
          }
        }
      }
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error && error.name === 'TypeError' && error.message.includes('fetch')
        ? 'Could not reach the local Ollama backend. Is it running?'
        : `Error: ${error instanceof Error ? error.message : String(error)}`;
      setMessages(m => [...m, { role: 'assistant', content: `\n\n**Error:** ${msg}` }]);
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden text-gray-900">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-gray-200 font-bold text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-600" />
            AI Workspace
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-100">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Local Model</label>
          <select 
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
          >
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Chats</div>
          <button className="w-full text-left px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-md font-medium">
            Current Session
          </button>
        </div>
        <div className="p-4 border-t border-gray-200">
          <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 w-full px-3 py-2 rounded-md hover:bg-gray-100 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 md:px-8 font-bold text-lg shadow-sm z-10 justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-1 px-2 md:hidden hover:bg-gray-100 rounded-md border border-gray-200"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span>AI Workspace</span>
          </div>
          <div className="text-sm font-normal text-gray-500 hidden sm:block">
            {model}
          </div>
        </header>

        {/* Chat Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6"
        >
          <div className="max-w-3xl mx-auto space-y-8">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-4", m.role === 'user' ? "justify-end" : "justify-start")}>
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-indigo-600" />
                  </div>
                )}
                
                <div className={cn(
                  "px-5 py-4 rounded-2xl max-w-[85%] overflow-hidden",
                  m.role === 'user' 
                    ? "bg-indigo-600 text-white rounded-tr-none" 
                    : "bg-white border border-gray-200 shadow-sm rounded-tl-none"
                )}>
                  {m.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  ) : (
                    <div className="prose prose-slate prose-sm md:prose-base max-w-none prose-pre:bg-transparent prose-pre:p-0">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <div className="rounded-md overflow-hidden my-4 border border-gray-700">
                                <div className="bg-gray-800 px-4 py-1.5 text-xs text-gray-400 flex justify-between items-center border-b border-gray-700">
                                  <span>{match[1]}</span>
                                </div>
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{ margin: 0, borderRadius: 0, padding: '1rem' }}
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code className={cn("bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-indigo-600", className)} {...props}>
                                {children}
                              </code>
                            );
                          },
                          table({ children }) {
                            return (
                              <div className="overflow-x-auto my-6 border border-gray-200 rounded-lg shadow-sm">
                                <table className="min-w-full divide-y divide-gray-200">
                                  {children}
                                </table>
                              </div>
                            );
                          },
                          thead({ children }) {
                            return <thead className="bg-gray-50">{children}</thead>;
                          },
                          th({ children }) {
                            return <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{children}</th>;
                          },
                          td({ children }) {
                            return <td className="px-4 py-2 text-sm text-gray-700 border-t border-gray-100">{children}</td>;
                          }
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
            {isTyping && messages[messages.length - 1].role === 'user' && (
              <div className="flex gap-4">
                 <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="px-5 py-4 rounded-2xl bg-white border border-gray-200 shadow-sm rounded-tl-none flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="max-w-3xl mx-auto">
            {messages.length <= 1 && (
              <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => applySuggestion(s.prompt)}
                    className="flex-shrink-0 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition-all duration-200 flex items-center gap-2 whitespace-nowrap shadow-sm"
                  >
                    <span>{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask anything..."
              className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none shadow-sm max-h-48"
              rows={1}
            />
            <button 
              onClick={send}
              disabled={!input.trim() || isTyping}
              className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center text-xs text-gray-400 mt-2">
            AI can make mistakes. Consider verifying important information.
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}