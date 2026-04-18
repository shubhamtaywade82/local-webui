import { useState } from 'react';
import {
  FileText, Activity, Database, Search,
  ChevronRight, ChevronDown, CheckCircle2,
  XCircle, Loader2, Wrench, BookOpen, Layers
} from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import KnowledgeUpload from './KnowledgeUpload';
import { useEffect } from 'react';

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

// ── Sample data for demonstration ──

// Removed sample data

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
            {/* Timeline Connector */}
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

                {/* Expanded Details */}
                {isExpanded && (step.input || step.output) && (
                  <div
                    className="mt-2 space-y-3"
                  >
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

      {/* Stats */}
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

      {/* File List */}
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

// ── Main Component ──

type TabId = 'sources' | 'agent' | 'knowledge';

export default function ResearchPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('agent');
  const { activeConversation, submitAgentApproval } = useChatStore();

  const sources = Array.from(new Set((activeConversation?.messages ?? []).flatMap(m => m.sources ?? [])));

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'sources', label: 'Sources', icon: FileText },
    { id: 'agent', label: 'Agent', icon: Activity },
    { id: 'knowledge', label: 'KB', icon: Database },
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
