import { useState, useCallback, useRef, useEffect } from 'react';

export interface PanelConfig {
  id: string;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  collapsible?: boolean;
}

interface PanelState {
  width: number;
  collapsed: boolean;
}

const STORAGE_KEY = 'ai-workspace-panels';

function loadPanelStates(): Record<string, PanelState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePanelStates(states: Record<string, PanelState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    // Storage full or unavailable
  }
}

export function useResizablePanels(configs: PanelConfig[]) {
  const saved = loadPanelStates();

  const [panels, setPanels] = useState<Record<string, PanelState>>(() => {
    const initial: Record<string, PanelState> = {};
    for (const cfg of configs) {
      if (saved && saved[cfg.id]) {
        initial[cfg.id] = saved[cfg.id];
      } else {
        initial[cfg.id] = { width: cfg.defaultWidth, collapsed: false };
      }
    }
    return initial;
  });

  const activeResizeRef = useRef<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Persist changes
  useEffect(() => {
    savePanelStates(panels);
  }, [panels]);

  const startResize = useCallback((panelId: string, e: React.MouseEvent) => {
    e.preventDefault();
    activeResizeRef.current = panelId;
    startXRef.current = e.clientX;
    startWidthRef.current = panels[panelId]?.width ?? 300;

    const onMouseMove = (ev: MouseEvent) => {
      if (!activeResizeRef.current) return;
      const cfg = configs.find(c => c.id === activeResizeRef.current);
      if (!cfg) return;

      const delta = ev.clientX - startXRef.current;
      const newWidth = Math.min(
        cfg.maxWidth,
        Math.max(cfg.minWidth, startWidthRef.current + delta)
      );

      setPanels(prev => ({
        ...prev,
        [cfg.id]: { ...prev[cfg.id], width: newWidth, collapsed: false }
      }));
    };

    const onMouseUp = () => {
      activeResizeRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panels, configs]);

  const toggleCollapse = useCallback((panelId: string) => {
    setPanels(prev => ({
      ...prev,
      [panelId]: { ...prev[panelId], collapsed: !prev[panelId].collapsed }
    }));
  }, []);

  const getPanelWidth = useCallback((panelId: string): number => {
    const state = panels[panelId];
    if (!state) return 300;
    return state.collapsed ? 0 : state.width;
  }, [panels]);

  const isPanelCollapsed = useCallback((panelId: string): boolean => {
    return panels[panelId]?.collapsed ?? false;
  }, [panels]);

  return {
    panels,
    startResize,
    toggleCollapse,
    getPanelWidth,
    isPanelCollapsed,
    isResizing: activeResizeRef.current !== null
  };
}
