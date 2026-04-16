import { useEffect, useRef, useState, useCallback } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { LocalConnection } from '@/lib/connections/localConnection';
import type { ConnectionProject } from '@/lib/connections/types';
import { ProjectListView } from './ProjectListView';
import App from '@/App';

interface LocalTab {
  id: string;
  projectId: string;
  label: string;
}

export function LocalDirectShell() {
  const connRef = useRef<LocalConnection | null>(null);
  if (!connRef.current) {
    connRef.current = new LocalConnection();
  }
  const conn = connRef.current;

  const [status, setStatus] = useState(conn.status);
  const [error, setError] = useState(conn.error);
  const [tabs, setTabs] = useState<LocalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('projects');

  // Subscribe to connection status
  useEffect(() => {
    return conn.onStatusChange((s, e) => {
      setStatus(s);
      setError(e);
    });
  }, [conn]);

  // Auto-connect on mount
  useEffect(() => {
    if (conn.status === 'disconnected') {
      conn.connect().catch(() => {});
    }
  }, [conn]);

  const openProject = useCallback((project: ConnectionProject) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.projectId === project.id);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const tab: LocalTab = {
        id: crypto.randomUUID(),
        projectId: project.id,
        label: project.name,
      };
      setActiveTabId(tab.id);
      return [...prev, tab];
    });
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          const newActive = next[Math.min(idx, next.length - 1)];
          setActiveTabId(newActive?.id ?? 'projects');
        }
        return next;
      });
    },
    [activeTabId]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx === 0) {
          setActiveTabId('projects');
        } else {
          const tab = tabs[idx - 1];
          if (tab) setActiveTabId(tab.id);
        }
      }
      if (e.ctrlKey && e.key === 'w') {
        if (activeTabId !== 'projects') {
          e.preventDefault();
          closeTab(activeTabId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, closeTab]);

  // Loading state
  if (status === 'connecting') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-2">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-foreground/60" />
          <p className="text-foreground/50 text-sm">
            Connecting to local server...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3">
          <p className="text-destructive text-sm">
            {error || 'Connection failed'}
          </p>
          <button
            className="px-4 py-2 text-sm bg-foreground text-background rounded hover:opacity-85"
            onClick={() => conn.connect().catch(() => {})}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Not connected yet (initial state before connect() is called)
  if (status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <div className="flex flex-col h-screen bg-background">
          {/* Tab bar — only show when there are project tabs open */}
          {tabs.length > 0 && (
            <div
              className="flex items-center border-b border-border bg-muted/50 overflow-x-auto"
              style={{ minHeight: '42px' }}
            >
              {/* Projects tab — always first, not closable */}
              <button
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-r border-border whitespace-nowrap shrink-0 transition-colors ${
                  activeTabId === 'projects'
                    ? 'bg-background text-foreground'
                    : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
                }`}
                onClick={() => setActiveTabId('projects')}
              >
                Projects
              </button>

              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`group flex items-center gap-1.5 px-4 py-2 text-sm border-r border-border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    activeTabId === tab.id
                      ? 'bg-background text-foreground font-medium'
                      : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
                  }`}
                  onClick={() => setActiveTabId(tab.id)}
                  title={tab.label}
                >
                  <span className="max-w-[180px] truncate">{tab.label}</span>
                  <button
                    className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-foreground/10 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {/* Projects list — default view */}
            <div
              className={`h-full overflow-hidden ${activeTabId === 'projects' ? '' : 'hidden'}`}
            >
              <ProjectListView onOpenProject={openProject} />
            </div>

            {/* Project tabs — keep mounted to preserve state */}
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`h-full overflow-hidden ${activeTabId === tab.id ? '' : 'hidden'}`}
              >
                <App initialPath={`/local-projects/${tab.projectId}/tasks`} />
              </div>
            ))}
          </div>
        </div>
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
