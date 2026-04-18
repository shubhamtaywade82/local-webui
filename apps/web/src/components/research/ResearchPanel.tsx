import { useState, useEffect } from 'react';
import {
  FileText, Activity, Database, Search,
  ChevronRight, ChevronDown, CheckCircle2,
  XCircle, Loader2, Wrench, BookOpen, Layers,
  Brain
} from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import KnowledgeUpload from './KnowledgeUpload';

// ── Types ──

interface AgentStep {
  id: string;
  label: string;
  tool?: string;
  status: 'running' | 'success' | 'error';
  duration?: number;
  input?: string;
  output?: string;
  timestamp?: number;
  pendingApproval?: boolean;
}

interface KbStats {
  totalDirectories: number;
  totalDocuments: number;
  totalChunks: number;
  totalEmbeddedChunks: number;
}

// ── Components ──

function AgentTimeline({
  steps,
  onAgentApproval
}: {
  steps: AgentStep[];
  onAgentApproval: (approved: boolean, stepId: string) => void;
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatTechnicalData = (data: string | undefined) => {
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  };

  const statusConfig = {
    running: { icon: Loader2, color: 'var(--warning)', animate: true },
    success: { icon: CheckCircle2, color: 'var(--success)', animate: false },
    error: { icon: XCircle, color: 'var(--error)', animate: false },
  };

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
        <Activity size={28} className="mb-3" />
        <p className="text-xs">No agent executions yet</p>
        <p className="text-[10px] mt-1">Agent tool calls will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-3">
      {steps.map((step, idx) => {
        const config = statusConfig[step.status];
        const StatusIcon = config.icon;
        const isExpanded = expandedSteps.has(step.id);
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id} className="relative">
            {!isLast && (
              <div
                className="absolute left-[11px] top-8 bottom-0 w-px"
                style={{ background: 'var(--border-subtle)' }}
              />
            )}

            <button
              onClick={() => toggleStep(step.id)}
              className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors hover:bg-white/[0.02]"
            >
              <StatusIcon
                size={14}
                className={`flex-shrink-0 mt-0.5 ${config.animate ? 'animate-spin' : ''}`}
                style={{ color: config.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {step.label}
                  </span>
                  {step.duration && (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {step.duration}ms
                    </span>
                  )}
                </div>
                {step.tool && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Wrench size={9} style={{ color: 'var(--text-muted)' }} />
                    <span
                      className="text-[10px] font-mono"
                      style={{ color: 'var(--accent)' }}
                    >
                      {step.tool}
                    </span>
                  </div>
                )}

                {step.pendingApproval && (
                  <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onAgentApproval(true, step.id)}
                      className="text-[10px] px-2 py-1 rounded-md font-medium"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onAgentApproval(false, step.id)}
                      className="text-[10px] px-2 py-1 rounded-md font-medium"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                    >
                      Reject
                    </button>
                  </div>
                )}

                {isExpanded && (step.input || step.output) && (
                  <div className="mt-2 space-y-3">
                    {step.input && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Input Arguments</div>
                        <pre 
                          className="p-2 rounded-md overflow-x-auto font-mono text-[10px] leading-relaxed"
                          style={{
                            background: '#00000040',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {formatTechnicalData(step.input)}
                        </pre>
                      </div>
                    )}
                    {step.output && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Result Output</div>
                        <pre 
                          className="p-2 rounded-md overflow-x-auto font-mono text-[10px] leading-relaxed max-h-[300px]"
                          style={{
                            background: '#00000040',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {formatTechnicalData(step.output)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {(step.input || step.output) && (
                isExpanded
                  ? <ChevronDown size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
                  : <ChevronRight size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function KnowledgeBaseView() {
  const [files, setFiles] = useState<string[]>([]);
  const [stats, setStats] = useState<KbStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/kb/list');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch KB data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-3 space-y-4">
      <KnowledgeUpload />
      <div
        className="grid grid-cols-3 gap-2 p-3 rounded-lg"
        style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)'
        }}
      >
        {[
          { label: 'Files', value: stats?.totalDocuments ?? '0', icon: FileText },
          { label: 'Chunks', value: stats?.totalChunks ?? '0', icon: Layers },
          { label: 'Embedded', value: stats?.totalEmbeddedChunks ?? '0', icon: Database },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="text-center">
              <Icon size={14} className="mx-auto mb-1" style={{ color: 'var(--accent)' }} />
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          );
        })}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Indexed Documents
          </div>
          <button 
            onClick={fetchData} 
            className="text-[10px] hover:text-[var(--accent)] transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : files.length === 0 ? (
          <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-xs">No documents indexed yet.</p>
          </div>
        ) : (
          <div className="space-y-0.5 max-h-[300px] overflow-y-auto pr-1">
            {files.map((path, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors hover:bg-white/[0.03]"
              >
                <BookOpen size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {path}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StrategyView({ onAction }: { onAction: (prompt: string) => void }) {
  const [hoveredAction, setHoveredAction] = useState<number | null>(null);
  const [pulse, setPulse] = useState<any[]>([]);
  const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down' | null>>({});

  useEffect(() => {
    let lastKnownPrices: Record<string, number> = {};

    // Initial fetch
    const fetchPulse = async () => {
      try {
        const res = await fetch('/api/market/pulse');
        if (res.ok) {
          const data = await res.json();
          setPulse(data.pulse);
          data.pulse.forEach((p: any) => {
            const n = parseFloat(String(p.price ?? '').replace(/,/g, ''));
            if (Number.isFinite(n)) lastKnownPrices[p.sym] = n;
          });
        }
      } catch (err) {
        console.error('Pulse fetch failed:', err);
      }
    };
    fetchPulse();

    // Same-origin WS via Vite proxy → Fastify `/market/ws` (see apps/server/src/routes/market.ts)
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/api/market/ws`;
    let socketRef: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      if (socketRef) socketRef.close();
      
      const ws = new WebSocket(wsUrl);
      socketRef = ws;

      ws.onopen = () => {
        console.log('Market Pulse WS connected:', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'initial') {
            setPulse(msg.data);
            msg.data.forEach((p: any) => {
              const n = parseFloat(String(p.price ?? '').replace(/,/g, ''));
              if (Number.isFinite(n)) lastKnownPrices[p.sym] = n;
            });
            return;
          }

        if (msg.type === 'update') {
          const update = msg.data;
          const currentPrice = parseFloat(String(update.price ?? '').replace(/,/g, ''));
          if (!Number.isFinite(currentPrice)) {
            return;
          }
            
            setPulse(prev => {
              const next = [...prev];
              const idx = next.findIndex(p => p.sym === update.sym);
              if (idx >= 0) {
                next[idx] = { ...next[idx], ...update };
              } else {
                next.push(update);
              }
              return next;
            });

            // Trigger Flash Animation using local ref
            const prevPrice = lastKnownPrices[update.sym] || 0;
            if (currentPrice !== prevPrice) {
              setFlashStates(f => ({ ...f, [update.sym]: currentPrice > prevPrice ? 'up' : 'down' }));
              setTimeout(() => {
                setFlashStates(f => ({ ...f, [update.sym]: null }));
              }, 600);
            }
            lastKnownPrices[update.sym] = currentPrice;
          }
        } catch (err) {
          console.error('WS Pulse data error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('Alpha Pulse Stream Error:', err);
      };

      ws.onclose = () => {
        console.warn('Alpha Pulse Stream closed. Retrying in 3s...');
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (socketRef) {
        socketRef.onclose = null;
        socketRef.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const marketPulse = pulse.length > 0 ? pulse : [
    { sym: 'BTC', price: '--', change: '0%', trend: 'Neutral', color: 'var(--text-muted)' },
    { sym: 'ETH', price: '--', change: '0%', trend: 'Neutral', color: 'var(--text-muted)' },
    { sym: 'SOL', price: '--', change: '0%', trend: 'Neutral', color: 'var(--text-muted)' },
  ];

  const actions = [
    { 
      title: 'Structural Scan', 
      desc: 'Map BoS, ChoCh & key OBs. Alerts on Telegram.', 
      prompt: '[STRATEGY_MODE: SMC] Perform a deep SMC market structure analysis for current market.',
      icon: Activity,
      color: '#7c5dfa',
      complexity: 'High'
    },
    { 
      title: 'Macro Context', 
      desc: '1H/4H Order Flow & HTF bias audit.', 
      prompt: '[STRATEGY_MODE: SMC] Analyze the HTF (1H/4H) context for B-BTC_USDT and determine the overall Order Flow bias.',
      icon: BookOpen,
      color: '#a78bfa',
      complexity: 'Medium'
    },
    { 
      title: 'Liquidity Hunter', 
      desc: 'Detect sweeps & inducement zones.', 
      prompt: '[STRATEGY_MODE: LIQUIDITY] Identify recent liquidity sweeps of Daily Highs/Lows and potential inducement areas on ETH.',
      icon: Database,
      color: '#fbbf24',
      complexity: 'High'
    },
    { 
      title: 'Premium/Discount', 
      desc: 'Range audit & Fib-based positioning.', 
      prompt: '[STRATEGY_MODE: SMC] Apply a range audit to the current structure and identify if we are in a Discount or Premium zone for entries.',
      icon: Layers,
      color: '#34d399',
      complexity: 'Medium'
    },
    { 
      title: 'Intraday Trend', 
      desc: 'Trend & sentiment audit. Signals to TG.', 
      prompt: '[STRATEGY_MODE: TREND] What is the current intraday trend and volume profile of B-ETH_USDT?',
      icon: Activity,
      color: '#ec4899',
      complexity: 'Medium'
    },
    { 
      title: 'Test Telegram', 
      desc: 'Verify bot configuration & credentials.', 
      prompt: 'Send a test message to my Telegram channel: "System Check: SMC Alpha Terminal is online."',
      icon: CheckCircle2,
      color: '#60a5fa',
      complexity: 'Low'
    }
  ];

  return (
    <div className="p-4 space-y-6 animate-fade-in no-scrollbar">
      {/* ── Market Pulse Header ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--success)] shadow-[0_0_8px_var(--success)] animate-pulse" />
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Market Pulse</h3>
          </div>
          <span className="text-[9px] text-[var(--text-muted)] font-mono">LIVE FEED</span>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          {marketPulse.map((item, i) => {
            const flash = flashStates[item.sym];
            const flashClass = flash === 'up' ? 'animate-pulse-green' : flash === 'down' ? 'animate-pulse-red' : '';
            
            return (
              <div 
                key={i} 
                className="glass-card p-2.5 border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-all cursor-default"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{item.sym}</span>
                  <span className="text-[9px] font-mono" style={{ color: item.color }}>{item.change}</span>
                </div>
                <div 
                  className={`text-[10px] font-medium mb-1 transition-all ${flashClass}`} 
                  style={{ color: flash === 'up' ? 'var(--success)' : flash === 'down' ? 'var(--error)' : 'var(--text-secondary)' }}
                >
                  ${item.price}
                </div>
                <div className="h-0.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ 
                      width: item.trend === 'Neutral' ? '50%' : item.trend.includes('Strong') ? '90%' : '75%',
                      backgroundColor: item.color 
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Strategic Commands ── */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] ml-1">Alpha Directives</h3>
        <div className="grid grid-cols-1 gap-2.5">
          {actions.map((action, i) => {
            const Icon = action.icon;
            const isHovered = hoveredAction === i;
            
            return (
              <button
                key={i}
                onMouseEnter={() => setHoveredAction(i)}
                onMouseLeave={() => setHoveredAction(null)}
                onClick={() => onAction(action.prompt)}
                className="relative group flex items-start gap-4 p-4 rounded-2xl border text-left transition-all duration-300 hover:translate-y-[-2px]"
                style={{ 
                  background: isHovered ? 'var(--bg-elevated)' : 'var(--bg-tertiary)', 
                  borderColor: isHovered ? 'var(--accent)' : 'var(--border-subtle)',
                  boxShadow: isHovered ? 'var(--shadow-glow)' : 'var(--shadow-md)'
                }}
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: `${action.color}15`, border: `1px solid ${action.color}30` }}
                >
                  <Icon size={22} style={{ color: action.color }} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">{action.title}</span>
                    <span 
                      className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border"
                      style={{ 
                        borderColor: `${action.color}40`, 
                        color: action.color,
                        background: `${action.color}08`
                      }}
                    >
                      {action.complexity}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                    {action.desc}
                  </p>
                </div>

                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight size={14} className="text-[var(--accent)]" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Intelligence Footer ── */}
      <div 
        className="glass-card p-4 border border-[var(--border-subtle)] relative overflow-hidden group"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-20 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-[var(--accent)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--text-secondary)]">Agent Intelligence</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--success)]/10 border border-[var(--success)]/20">
            <div className="w-1 h-1 rounded-full bg-[var(--success)] animate-pulse" />
            <span className="text-[8px] font-bold text-[var(--success)] uppercase">Telegram Active</span>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
          The agent is now optimized for <span className="text-[var(--accent)] font-bold">Secure Alerts</span>. 
          Identified Futures setups are dispatched to Telegram with full SMC parameters (Entry/SL/TP).
        </p>
      </div>
    </div>
  );
}

// ── Main Component ──

type TabId = 'sources' | 'agent' | 'knowledge' | 'strategy';

export default function ResearchPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('strategy');
  const { activeConversation, submitAgentApproval, sendMessage, createNewConversation } = useChatStore();

  const handleQuickAction = (prompt: string) => {
    if (!activeConversation) createNewConversation();
    setTimeout(() => sendMessage(prompt), 50);
  };

  const sources = Array.from(new Set((activeConversation?.messages ?? []).flatMap(m => m.sources ?? [])));

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'strategy', label: 'Strategy', icon: Brain },
    { id: 'agent', label: 'Agent', icon: Activity },
    { id: 'knowledge', label: 'KB', icon: Database },
    { id: 'sources', label: 'Sources', icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Tab Bar */}
      <div
        className="flex items-center gap-0 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                background: isActive ? 'var(--accent-muted)' : 'transparent'
              }}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'strategy' && (
          <StrategyView onAction={handleQuickAction} />
        )}
        {activeTab === 'sources' && (
          sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
              <Search size={28} className="mb-3" />
              <p className="text-xs">No sources retrieved yet</p>
              <p className="text-[10px] mt-1">RAG results will appear here</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                Retrieved Context
              </div>
              {sources.map((source, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
                  <FileText size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{source}</div>
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Used in current conversation</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
        {activeTab === 'agent' && (
          <AgentTimeline
            steps={(activeConversation?.agentSteps || []) as AgentStep[]}
            onAgentApproval={submitAgentApproval}
          />
        )}
        {activeTab === 'knowledge' && (
          <KnowledgeBaseView />
        )}
      </div>
    </div>
  );
}
