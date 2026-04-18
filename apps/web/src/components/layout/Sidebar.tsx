import { useState, useEffect } from 'react';
import {
  Plus, Search, Settings, Brain, ChevronDown,
  Trash2, MessageSquare, Zap, Wifi, WifiOff, Loader2, LogOut
} from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import SettingsModal from './SettingsModal';

export default function Sidebar() {
  const {
    state,
    dispatch,
    createNewConversation,
    checkOllamaStatus,
    fetchModels,
    loadConversations
  } = useChatStore();
  const { auth, logout } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchModels();
    checkOllamaStatus();
    loadConversations();
  }, []);

  const filteredConversations = state.conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusConfig = {
    connected: { icon: Wifi, color: 'var(--success)', label: 'Connected' },
    disconnected: { icon: WifiOff, color: 'var(--error)', label: 'Offline' },
    checking: { icon: Loader2, color: 'var(--warning)', label: 'Checking...' }
  };
  const statusInfo = statusConfig[state.ollamaStatus];
  const StatusIcon = statusInfo.icon;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)'
      }}
    >
      {/* ── Logo & New Chat ── */}
      <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-muted)' }}
          >
            <Zap size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            AI Workspace
          </span>
        </div>
        <button
          onClick={createNewConversation}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5"
          title="New conversation"
        >
          <Plus size={16} style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>

      {/* ── Model Selector ── */}
      <div className="p-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <label
          className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
          style={{ color: 'var(--text-muted)' }}
        >
          Model
        </label>
        <div className="relative">
          <select
            value={state.model}
            onChange={(e) => dispatch({ type: 'SET_MODEL', model: e.target.value })}
            className="w-full text-sm font-medium rounded-lg px-3 py-2 appearance-none cursor-pointer outline-none transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)'
            }}
          >
            {state.availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }}
          />
        </div>

        {/* Thinking Toggle */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5">
            <Brain size={13} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Thinking</span>
          </div>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_THINKING' })}
            className="relative w-8 h-[18px] rounded-full transition-colors"
            style={{
              background: state.isThinkingEnabled ? 'var(--accent)' : 'var(--bg-surface)'
            }}
          >
            <span
              className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform"
              style={{
                left: state.isThinkingEnabled ? '16px' : '2px'
              }}
            />
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs rounded-md pl-8 pr-3 py-1.5 outline-none transition-colors placeholder:text-[var(--text-muted)]"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)'
            }}
          />
        </div>
      </div>

      {/* ── Conversation List ── */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {filteredConversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {state.conversations.length === 0 ? 'Start a new conversation' : 'No matches found'}
            </p>
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isActive = conv.id === state.activeConversationId;
            const lastMsg = conv.messages[conv.messages.length - 1];
            return (
              <div
                key={conv.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: conv.id })}
                className="w-full text-left px-3 py-2 rounded-lg transition-colors group relative cursor-pointer"
                style={{
                  background: isActive ? 'var(--accent-muted)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{conv.title}</div>
                    {lastMsg && (
                      <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {lastMsg.content.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').slice(0, 60)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'DELETE_CONVERSATION', id: conv.id });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all flex-shrink-0"
                    title="Delete conversation"
                  >
                    <Trash2 size={12} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer: Status & Settings ── */}
      <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {/* Ollama Status */}
        <button
          onClick={checkOllamaStatus}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-white/5"
        >
          <StatusIcon
            size={12}
            style={{ color: statusInfo.color }}
            className={state.ollamaStatus === 'checking' ? 'animate-spin' : ''}
          />
          <span style={{ color: 'var(--text-tertiary)' }}>
            Ollama: <span style={{ color: statusInfo.color }}>{statusInfo.label}</span>
          </span>
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-white/5"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <Settings size={13} />
          Settings
        </button>

        {/* User / Logout */}
        {auth.email && (
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-tertiary)' }}
            title={`Signed in as ${auth.email}`}
          >
            <LogOut size={13} />
            <span className="truncate">{auth.email}</span>
          </button>
        )}
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
