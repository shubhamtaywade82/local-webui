import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';

// ── Types ──

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  sources?: string[];
  timestamp: number;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  messages: Message[];
}

export type StreamingState = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  model: string;
  isThinkingEnabled: boolean;
  systemPrompt: string;
  streamingState: StreamingState;
  availableModels: string[];
  ollamaStatus: 'connected' | 'disconnected' | 'checking';
}

// ── Actions ──

type ChatAction =
  | { type: 'SET_MODEL'; model: string }
  | { type: 'TOGGLE_THINKING' }
  | { type: 'SET_SYSTEM_PROMPT'; prompt: string }
  | { type: 'SET_STREAMING_STATE'; state: StreamingState }
  | { type: 'SET_OLLAMA_STATUS'; status: ChatState['ollamaStatus'] }
  | { type: 'SET_MODELS'; models: string[] }
  | { type: 'CREATE_CONVERSATION'; id: string; title: string; model: string }
  | { type: 'SET_ACTIVE_CONVERSATION'; id: string }
  | { type: 'DELETE_CONVERSATION'; id: string }
  | { type: 'RENAME_CONVERSATION'; id: string; title: string }
  | { type: 'ADD_MESSAGE'; conversationId: string; message: Message }
  | { type: 'APPEND_TOKEN'; conversationId: string; messageId: string; token: string }
  | { type: 'SET_MESSAGE_SOURCES'; conversationId: string; messageId: string; sources: string[] }
  | { type: 'FINISH_STREAMING'; conversationId: string; messageId: string }
  | { type: 'SET_CONVERSATIONS'; conversations: Conversation[] };

// ── Reducer ──

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MODEL':
      return { ...state, model: action.model };

    case 'TOGGLE_THINKING':
      return { ...state, isThinkingEnabled: !state.isThinkingEnabled };

    case 'SET_SYSTEM_PROMPT':
      return { ...state, systemPrompt: action.prompt };

    case 'SET_STREAMING_STATE':
      return { ...state, streamingState: action.state };

    case 'SET_OLLAMA_STATUS':
      return { ...state, ollamaStatus: action.status };

    case 'SET_MODELS':
      return { ...state, availableModels: action.models };

    case 'CREATE_CONVERSATION': {
      const conv: Conversation = {
        id: action.id,
        title: action.title,
        model: action.model,
        createdAt: Date.now(),
        messages: []
      };
      return {
        ...state,
        conversations: [conv, ...state.conversations],
        activeConversationId: action.id
      };
    }

    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversationId: action.id };

    case 'DELETE_CONVERSATION': {
      const remaining = state.conversations.filter(c => c.id !== action.id);
      return {
        ...state,
        conversations: remaining,
        activeConversationId:
          state.activeConversationId === action.id
            ? (remaining[0]?.id ?? null)
            : state.activeConversationId
      };
    }

    case 'RENAME_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.id ? { ...c, title: action.title } : c
        )
      };

    case 'ADD_MESSAGE':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.conversationId
            ? { ...c, messages: [...c.messages, action.message] }
            : c
        )
      };

    case 'APPEND_TOKEN':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.conversationId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === action.messageId
                    ? { ...m, content: m.content + action.token }
                    : m
                )
              }
            : c
        )
      };

    case 'SET_MESSAGE_SOURCES':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.conversationId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === action.messageId
                    ? { ...m, sources: action.sources }
                    : m
                )
              }
            : c
        )
      };

    case 'FINISH_STREAMING':
      return {
        ...state,
        streamingState: 'done',
        conversations: state.conversations.map(c =>
          c.id === action.conversationId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === action.messageId
                    ? { ...m, isStreaming: false }
                    : m
                )
              }
            : c
        )
      };

    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations };

    default:
      return state;
  }
}

// ── Initial State ──

function getPersistedChatSettings() {
  try {
    const raw = localStorage.getItem('ai-workspace-settings');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

const savedSettings = getPersistedChatSettings();

const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  model: savedSettings.model || 'llama3.2:3b',
  isThinkingEnabled: savedSettings.isThinkingEnabled ?? false,
  systemPrompt: savedSettings.systemPrompt || '',
  streamingState: 'idle',
  availableModels: [
    'llama3.2:3b',
    'qwen3.5:4b',
    'qwen2.5:0.5b',
    'deepseek-coder:6.7b'
  ],
  ollamaStatus: 'checking'
};

// ── Context ──

interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  activeConversation: Conversation | null;
  sendMessage: (content: string) => Promise<void>;
  createNewConversation: () => void;
  checkOllamaStatus: () => Promise<void>;
  fetchModels: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatStore(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatStoreProvider');
  return ctx;
}

// ── Provider ──

export function ChatStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('ai-workspace-settings', JSON.stringify({
      model: state.model,
      isThinkingEnabled: state.isThinkingEnabled,
      systemPrompt: state.systemPrompt
    }));
  }, [state.model, state.isThinkingEnabled, state.systemPrompt]);

  const activeConversation = state.conversations.find(
    c => c.id === state.activeConversationId
  ) ?? null;

  const createNewConversation = useCallback(() => {
    const id = crypto.randomUUID();
    dispatch({
      type: 'CREATE_CONVERSATION',
      id,
      title: 'New Chat',
      model: state.model
    });
  }, [state.model]);

  const checkOllamaStatus = useCallback(async () => {
    dispatch({ type: 'SET_OLLAMA_STATUS', status: 'checking' });
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        dispatch({ type: 'SET_OLLAMA_STATUS', status: 'connected' });
      } else {
        dispatch({ type: 'SET_OLLAMA_STATUS', status: 'disconnected' });
      }
    } catch {
      dispatch({ type: 'SET_OLLAMA_STATUS', status: 'disconnected' });
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          dispatch({ type: 'SET_MODELS', models: data.models.map((m: any) => m.name || m) });
          dispatch({ type: 'SET_OLLAMA_STATUS', status: 'connected' });
        }
      }
    } catch {
      // Use defaults
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || state.streamingState === 'streaming') return;

    // Ensure there's an active conversation
    let convId = state.activeConversationId;
    if (!convId) {
      convId = crypto.randomUUID();
      dispatch({
        type: 'CREATE_CONVERSATION',
        id: convId,
        title: content.slice(0, 40),
        model: state.model
      });
    }

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };
    dispatch({ type: 'ADD_MESSAGE', conversationId: convId, message: userMsg });

    // Create assistant placeholder
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    };
    dispatch({ type: 'ADD_MESSAGE', conversationId: convId, message: assistantMsg });
    dispatch({ type: 'SET_STREAMING_STATE', state: 'thinking' });

    // Get current messages for context
    const currentConv = state.conversations.find(c => c.id === convId);
    const contextMessages = [
      ...(currentConv?.messages.map(m => ({ role: m.role, content: m.content })) ?? []),
      { role: 'user' as const, content }
    ];

    // Abort previous stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: state.model,
          messages: contextMessages,
          thinking: state.isThinkingEnabled,
          systemPrompt: state.systemPrompt || undefined
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text();
        dispatch({
          type: 'APPEND_TOKEN',
          conversationId: convId,
          messageId: assistantId,
          token: `**Error:** ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`
        });
        dispatch({ type: 'SET_STREAMING_STATE', state: 'error' });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        dispatch({
          type: 'APPEND_TOKEN',
          conversationId: convId,
          messageId: assistantId,
          token: '**Error:** No response body.'
        });
        dispatch({ type: 'SET_STREAMING_STATE', state: 'error' });
        return;
      }

      dispatch({ type: 'SET_STREAMING_STATE', state: 'streaming' });

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
              dispatch({
                type: 'APPEND_TOKEN',
                conversationId: convId,
                messageId: assistantId,
                token: data.token
              });
            } else if (data.sources) {
              dispatch({
                type: 'SET_MESSAGE_SOURCES',
                conversationId: convId,
                messageId: assistantId,
                sources: data.sources
              });
            } else if (data.error) {
              dispatch({
                type: 'APPEND_TOKEN',
                conversationId: convId,
                messageId: assistantId,
                token: `\n\n**Stream Error:** ${data.error}`
              });
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }

      dispatch({ type: 'FINISH_STREAMING', conversationId: convId, messageId: assistantId });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error && err.name === 'TypeError' && err.message.includes('fetch')
        ? 'Could not reach the backend. Is Ollama running?'
        : `Error: ${err instanceof Error ? err.message : String(err)}`;
      dispatch({
        type: 'APPEND_TOKEN',
        conversationId: convId,
        messageId: assistantId,
        token: `\n\n**Error:** ${msg}`
      });
      dispatch({ type: 'SET_STREAMING_STATE', state: 'error' });
    }
  }, [state]);

  const value: ChatContextValue = {
    state,
    dispatch,
    activeConversation,
    sendMessage,
    createNewConversation,
    checkOllamaStatus,
    fetchModels
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
