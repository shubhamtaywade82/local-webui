import {
  PanelLeft, Code2, MessageSquare, BookOpen
} from 'lucide-react';
import { useResizablePanels, type PanelConfig } from '../../hooks/useResizablePanels';
import Sidebar from './Sidebar';
import ChatPanel from '../chat/ChatPanel';
import CodeEditorPanel from '../editor/CodeEditorPanel';
import ResearchPanel from '../research/ResearchPanel';

const PANEL_CONFIGS: PanelConfig[] = [
  { id: 'sidebar', minWidth: 240, maxWidth: 400, defaultWidth: 280, collapsible: true },
  { id: 'editor', minWidth: 300, maxWidth: 900, defaultWidth: 480, collapsible: true },
  { id: 'research', minWidth: 280, maxWidth: 600, defaultWidth: 380, collapsible: true },
];

export default function WorkspaceLayout() {
  const {
    getPanelWidth,
    isPanelCollapsed,
    startResize,
    toggleCollapse
  } = useResizablePanels(PANEL_CONFIGS);

  const sidebarCollapsed = isPanelCollapsed('sidebar');
  const editorCollapsed = isPanelCollapsed('editor');
  const researchCollapsed = isPanelCollapsed('research');
  const sidebarWidth = getPanelWidth('sidebar');
  const editorWidth = getPanelWidth('editor');
  const researchWidth = getPanelWidth('research');

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* ── Sidebar ── */}
      <div
        className="flex-shrink-0 overflow-hidden transition-all"
        style={{
          width: sidebarCollapsed ? 0 : sidebarWidth,
          transitionDuration: '300ms'
        }}
      >
        <Sidebar />
      </div>

      {/* ── Sidebar Divider ── */}
      {!sidebarCollapsed && (
        <div
          className="panel-divider"
          onMouseDown={(e) => startResize('sidebar', e)}
        />
      )}

      {/* ── Main Content Area (Chat + Research) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header
          className="flex items-center justify-between px-4 flex-shrink-0 border-b"
          style={{
            height: 'var(--header-height)',
            background: 'var(--bg-secondary)',
            borderColor: 'var(--border-subtle)'
          }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleCollapse('sidebar')}
              className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
              title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            >
              <PanelLeft size={18} style={{ color: 'var(--text-tertiary)' }} />
            </button>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium">AI Workspace</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleCollapse('research')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-white/5 transition-colors"
              style={{
                color: researchCollapsed ? 'var(--text-tertiary)' : 'var(--accent)',
                background: researchCollapsed ? 'transparent' : 'var(--accent-muted)'
              }}
              title={researchCollapsed ? 'Show research' : 'Hide research'}
            >
              <BookOpen size={14} />
              <span className="hidden sm:inline">Research</span>
            </button>
            <button
              onClick={() => toggleCollapse('editor')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium hover:bg-white/5 transition-colors"
              style={{
                color: editorCollapsed ? 'var(--text-tertiary)' : 'var(--accent)',
                background: editorCollapsed ? 'transparent' : 'var(--accent-muted)'
              }}
              title={editorCollapsed ? 'Show editor' : 'Hide editor'}
            >
              <Code2 size={14} />
              <span className="hidden sm:inline">Editor</span>
            </button>
          </div>
        </header>

        {/* Content Panels */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat Panel */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <ChatPanel />
          </div>

          {/* Research Divider + Panel */}
          {!researchCollapsed && (
            <>
              <div
                className="panel-divider"
                onMouseDown={(e) => startResize('research', e)}
              />
              <div
                className="flex-shrink-0 overflow-hidden"
                style={{ width: researchWidth }}
              >
                <ResearchPanel />
              </div>
            </>
          )}

          {/* Editor Divider + Panel */}
          {!editorCollapsed && (
            <>
              <div
                className="panel-divider"
                onMouseDown={(e) => startResize('editor', e)}
              />
              <div
                className="flex-shrink-0 overflow-hidden"
                style={{ width: editorWidth }}
              >
                <CodeEditorPanel />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
