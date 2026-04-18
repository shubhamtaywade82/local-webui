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
  agentSteps: any[]; // Use any for simplicity or define AgentStep properly
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
  agentMode: boolean;
  agentStepMode: 'auto' | 'step';
  maxIterations: number;
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
  | { type: 'ADD_AGENT_STEP'; conversationId: string; step: any }
  | { type: 'CLEAR_AGENT_STEPS'; conversationId: string }
  | { type: 'SET_CONVERSATIONS'; conversations: Conversation[] }
  | { type: 'TOGGLE_AGENT_MODE' }
  | { type: 'SET_AGENT_STEP_MODE'; mode: 'auto' | 'step' }
  | { type: 'SET_MAX_ITERATIONS'; count: number };

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
        messages: [],
        agentSteps: []
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

    case 'ADD_AGENT_STEP':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.conversationId
            ? { 
                ...c, 
                agentSteps: [...(c.agentSteps || []).filter(s => s.id !== action.step.id), action.step] 
              }
            : c
        )
      };

    case 'CLEAR_AGENT_STEPS':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.conversationId ? { ...c, agentSteps: [] } : c
        )
      };

    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations };

    case 'TOGGLE_AGENT_MODE':
      return { ...state, agentMode: !state.agentMode };

    case 'SET_AGENT_STEP_MODE':
      return { ...state, agentStepMode: action.mode };

    case 'SET_MAX_ITERATIONS':
      return { ...state, maxIterations: action.count };

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
  ollamaStatus: 'checking',
  agentMode: savedSettings.agentMode ?? false,
  agentStepMode: savedSettings.agentStepMode || 'auto',
  maxIterations: savedSettings.maxIterations ?? 10
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
  loadConversations: () => Promise<void>;
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
      systemPrompt: state.systemPrompt,
      agentMode: state.agentMode,
      agentStepMode: state.agentStepMode,
      maxIterations: state.maxIterations,
    }));
  }, [state.model, state.isThinkingEnabled, state.systemPrompt, state.agentMode, state.agentStepMode, state.maxIterations]);

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

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = JSON.parse(localStorage.getItem('ai-workspace-auth') || '{}').token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
  };

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const convs: Conversation[] = data.map((c: any) => ({
            id: c.id,
            title: c.title,
            model: c.model,
            createdAt: new Date(c.createdAt).getTime(),
            messages: [],
            agentSteps: []
          }));
          dispatch({ type: 'SET_CONVERSATIONS', conversations: convs });
        }
      }
    } catch {}
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
    dispatch({ type: 'CLEAR_AGENT_STEPS', conversationId: convId });
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
      const token = (() => { try { return JSON.parse(localStorage.getItem('ai-workspace-auth') || '{}').token; } catch { return null; } })();
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/chat/`;
      const ws = new WebSocket(wsUrl);

      dispatch({ type: 'SET_STREAMING_STATE', state: 'streaming' });

      ws.onopen = () => {
        ws.send(JSON.stringify({
          model: state.model,
          messages: contextMessages,
          thinking: state.isThinkingEnabled,
          conversation_id: convId,
          systemPrompt: state.systemPrompt || undefined,
          agentMode: state.agentMode,
          agentStepMode: state.agentStepMode,
          maxIterations: state.maxIterations,
          token: token || undefined,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'token') {
            dispatch({
              type: 'APPEND_TOKEN',
              conversationId: convId,
              messageId: assistantId,
              token: data.token
            });
          } else if (data.type === 'sources') {
            dispatch({
              type: 'SET_MESSAGE_SOURCES',
              conversationId: convId,
              messageId: assistantId,
              sources: data.sources
            });
          } else if (data.type === 'tool_call') {
            // Intercept Tool Call!
            if (data.tool === 'edit_file') {
              console.log("TOOL CALL RECEIVED:", data);
              // Dispatch custom event to CodeEditorPanel
              window.dispatchEvent(new CustomEvent('editor:tool_call', {
                detail: {
                  path: data.path,
                  content: data.content
                }
              }));
              
              // Also add a little inline note to chat
              dispatch({
                type: 'APPEND_TOKEN',
                conversationId: convId,
                messageId: assistantId,
                token: `\n\n_Agent is modifying \`${data.path}\`..._\n`
              });
            }
          } else if (data.type === 'error') {
            dispatch({
              type: 'APPEND_TOKEN',
              conversationId: convId,
              messageId: assistantId,
              token: `\n\n**Stream Error:** ${data.error}`
            });
            dispatch({ type: 'FINISH_STREAMING', conversationId: convId, messageId: assistantId });
            dispatch({ type: 'SET_STREAMING_STATE', state: 'error' });
          } else if (data.type === 'agent_step') {
            dispatch({
              type: 'ADD_AGENT_STEP',
              conversationId: convId,
              step: data.step
            });
          } else if (data.type === 'agent_step_pending') {
            dispatch({
              type: 'ADD_AGENT_STEP',
              conversationId: convId,
              step: { ...data, id: data.stepId, label: `Approve: ${data.toolName}?`, status: 'running', pendingApproval: true }
            });
          } else if (data.type === 'sql_result') {
            window.dispatchEvent(new CustomEvent('sql:result', { detail: data }));
          } else if (data.type === 'done') {
            ws.close();
            dispatch({ type: 'FINISH_STREAMING', conversationId: convId, messageId: assistantId });
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        dispatch({
          type: 'APPEND_TOKEN',
          conversationId: convId,
          messageId: assistantId,
          token: `\n\n**Error:** WebSocket connection failed.`
        });
        dispatch({ type: 'SET_STREAMING_STATE', state: 'error' });
      };

      ws.onclose = () => {
        dispatch({ type: 'FINISH_STREAMING', conversationId: convId, messageId: assistantId });
      };

      // Ensure we can manually abort
      controller.signal.addEventListener('abort', () => ws.close());

    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = `Error: ${err instanceof Error ? err.message : String(err)}`;
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
    fetchModels,
    loadConversations
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
