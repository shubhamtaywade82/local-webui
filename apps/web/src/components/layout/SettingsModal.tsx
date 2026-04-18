import { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { SHIKI_THEMES } from '../../lib/shiki';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { state, dispatch, fetchModels, checkOllamaStatus } = useChatStore();
  
  // Local state for the form so we can cancel without saving
  const [providerMode, setProviderMode] = useState(state.providerMode);
  const [modelsByProvider, setModelsByProvider] = useState({
    local: state.providerConfigs.local.model,
    cloud: state.providerConfigs.cloud.model
  });
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(state.isThinkingEnabled);
  const [systemPrompt, setSystemPrompt] = useState(state.systemPrompt || '');
  const [agentMode, setAgentMode] = useState(state.agentMode);
  const [agentStepMode, setAgentStepMode] = useState(state.agentStepMode);
  const [maxIterations, setMaxIterations] = useState(state.maxIterations);
  const [shikiTheme, setShikiTheme] = useState((state as any).shikiTheme || 'github-dark');

  useEffect(() => {
    setModelsByProvider({
      local: state.providerConfigs.local.model,
      cloud: state.providerConfigs.cloud.model
    });
  }, [state.providerConfigs.local.model, state.providerConfigs.cloud.model]);

  const currentModels = state.providerConfigs[providerMode].availableModels;
  const currentModel = modelsByProvider[providerMode];

  const handleSave = () => {
    dispatch({ type: 'SET_MODEL', provider: 'local', model: modelsByProvider.local });
    dispatch({ type: 'SET_MODEL', provider: 'cloud', model: modelsByProvider.cloud });
    dispatch({ type: 'SET_PROVIDER_MODE', mode: providerMode });
    
    // Toggle thinking if it changed from the current state
    if (state.isThinkingEnabled !== isThinkingEnabled) {
      dispatch({ type: 'TOGGLE_THINKING' });
    }
    
    dispatch({ type: 'SET_SYSTEM_PROMPT', prompt: systemPrompt });
    if (state.agentMode !== agentMode) dispatch({ type: 'TOGGLE_AGENT_MODE' });
    dispatch({ type: 'SET_AGENT_STEP_MODE', mode: agentStepMode });
    dispatch({ type: 'SET_MAX_ITERATIONS', count: maxIterations });
    dispatch({ type: 'SET_SHIKI_THEME', theme: shikiTheme });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        style={{ 
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={18} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6 overflow-y-auto max-h-[70vh]">
          
          {/* Model Selection */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Provider
            </label>
            <select
              value={providerMode}
              onChange={(e) => {
                const nextProvider = e.target.value as 'local' | 'cloud';
                setProviderMode(nextProvider);
                void fetchModels(nextProvider);
                void checkOllamaStatus(nextProvider);
              }}
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)'
              }}
            >
              <option value="local">Local Ollama</option>
              <option value="cloud">Ollama Cloud</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Model
            </label>
            <select
              value={currentModel}
              onChange={(e) => setModelsByProvider((prev) => ({
                ...prev,
                [providerMode]: e.target.value
              }))}
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)'
              }}
            >
              {currentModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Thinking Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Thinking Mode</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Enable default step-by-step reasoning for agent responses.</div>
            </div>
            <button
              onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
              className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0 outline-none"
              style={{
                background: isThinkingEnabled ? 'var(--accent)' : 'var(--bg-surface)'
              }}
            >
              <span
                className="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-transform duration-200"
                style={{
                  left: isThinkingEnabled ? '22px' : '2px'
                }}
              />
            </button>
          </div>

          {/* Agent Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Agent Mode</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Use ReAct loop with tools instead of plain chat.</div>
            </div>
            <button
              onClick={() => setAgentMode(!agentMode)}
              className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0 outline-none"
              style={{ background: agentMode ? 'var(--accent)' : 'var(--bg-surface)' }}
            >
              <span
                className="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-transform duration-200"
                style={{ left: agentMode ? '22px' : '2px' }}
              />
            </button>
          </div>

          {/* Agent Execution Mode */}
          {agentMode && (
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Agent Execution Mode
              </label>
              <select
                value={agentStepMode}
                onChange={(e) => setAgentStepMode(e.target.value as 'auto' | 'step')}
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-colors"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              >
                <option value="auto">Auto — run all steps without approval</option>
                <option value="step">Step — approve each tool call</option>
              </select>
            </div>
          )}

          {/* Max Iterations */}
          {agentMode && (
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Max Iterations
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-colors"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Max tool-call iterations before the agent stops (1–50).</p>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Custom System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Leave blank to use the default instruction prompts..."
              rows={5}
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-colors resize-y"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem'
              }}
            />
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Overrides the default instructions sent to the Ollama model.
            </p>
          </div>

          {/* Syntax Highlight Theme */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Code Highlight Theme
            </label>
            <select
              value={shikiTheme}
              onChange={e => setShikiTheme(e.target.value)}
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-colors"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            >
              {SHIKI_THEMES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-4 border-t gap-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
          <button 
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors shadow-lg shadow-black/20"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Save size={14} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
