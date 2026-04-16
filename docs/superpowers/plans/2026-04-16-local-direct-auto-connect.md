# Local Direct Auto-Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the frontend is built with `VITE_APP_MODE=local-direct`, it auto-connects to the co-located backend using same-origin requests and shows the project list immediately — no manual connection setup needed.

**Architecture:** A new `LocalConnection` class implements `UnifiedConnection` with relative-path requests (no URL prefix). `TabShell` branches on `import.meta.env.VITE_APP_MODE`: in `local-direct` mode it creates a `LocalConnection` singleton and renders a simplified shell (project list + project tabs, no HomeTab). In all other modes, behavior is unchanged.

**Tech Stack:** React, TypeScript, Zustand, Vite env vars, existing `UnifiedConnection` interface

---

## File Structure

| File | Role |
|---|---|
| `frontend/src/lib/connections/localConnection.ts` | **New** — `LocalConnection` class: same-origin `UnifiedConnection` impl |
| `frontend/src/lib/isLocalDirect.ts` | **New** — single-source `isLocalDirect` constant |
| `frontend/src/components/tabs/ProjectListView.tsx` | **New** — extracted project list (shared by `MachineProjectsTab` and local-direct shell) |
| `frontend/src/components/tabs/LocalDirectShell.tsx` | **New** — top-level shell for local-direct mode (connection + tab management) |
| `frontend/src/components/tabs/TabShell.tsx` | **Modified** — branch: render `LocalDirectShell` or existing shell |
| `frontend/src/components/tabs/MachineProjectsTab.tsx` | **Modified** — delegate to extracted `ProjectListView` |
| `frontend/src/vite-env.d.ts` | **Modified** — declare `VITE_APP_MODE` |
| `package.json` | **Modified** — add `VITE_APP_MODE=local-direct` to `dev` script |
| `local-build.sh` | **Modified** — add `VITE_APP_MODE=local-direct` to frontend build |

---

### Task 1: Add `VITE_APP_MODE` env var and type declaration

**Files:**
- Modify: `frontend/src/vite-env.d.ts:1-3`
- Modify: `package.json:17` (dev script)
- Modify: `local-build.sh:50`
- Create: `frontend/src/lib/isLocalDirect.ts`

- [ ] **Step 1: Add `VITE_APP_MODE` to the Vite type declarations**

In `frontend/src/vite-env.d.ts`, add the `ImportMetaEnv` interface so TypeScript recognizes the env var:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Create the `isLocalDirect` helper**

Create `frontend/src/lib/isLocalDirect.ts`:

```ts
export const isLocalDirect =
  import.meta.env.VITE_APP_MODE === 'local-direct';
```

This is the single source of truth. All other files import from here instead of checking `import.meta.env` directly.

- [ ] **Step 3: Add `VITE_APP_MODE=local-direct` to the root `dev` script**

In `package.json`, update the `dev` script to export `VITE_APP_MODE`:

Change the `dev` line from:
```
"dev": "export FRONTEND_PORT=$(node scripts/setup-dev-environment.js frontend) && export BACKEND_PORT=$(node scripts/setup-dev-environment.js backend) && export VB_ALLOWED_ORIGINS=\"http://localhost:${FRONTEND_PORT}\" && concurrently \"pnpm run backend:dev:watch\" \"pnpm run frontend:dev\"",
```

To:
```
"dev": "export VITE_APP_MODE=local-direct && export FRONTEND_PORT=$(node scripts/setup-dev-environment.js frontend) && export BACKEND_PORT=$(node scripts/setup-dev-environment.js backend) && export VB_ALLOWED_ORIGINS=\"http://localhost:${FRONTEND_PORT}\" && concurrently \"pnpm run backend:dev:watch\" \"pnpm run frontend:dev\"",
```

- [ ] **Step 4: Add `VITE_APP_MODE=local-direct` to `local-build.sh`**

In `local-build.sh`, update the frontend build line (line 50) from:

```bash
(cd frontend && npm run build)
```

To:

```bash
(cd frontend && VITE_APP_MODE=local-direct npm run build)
```

- [ ] **Step 5: Verify the env var is accessible**

Run: `cd frontend && VITE_APP_MODE=local-direct npx tsc --noEmit`

Expected: no type errors related to `VITE_APP_MODE`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/vite-env.d.ts frontend/src/lib/isLocalDirect.ts package.json local-build.sh
git commit -m "feat(config): add VITE_APP_MODE env var for local-direct mode"
```

---

### Task 2: Create `LocalConnection` class

**Files:**
- Create: `frontend/src/lib/connections/localConnection.ts`

- [ ] **Step 1: Create `LocalConnection`**

Create `frontend/src/lib/connections/localConnection.ts`:

```ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
import type {
  UnifiedConnection,
  ConnectionStatus,
  WebSocketLike,
  ConnectionProject,
} from './types';

export class LocalConnection implements UnifiedConnection {
  readonly id = 'local';
  readonly type = 'direct' as const;
  readonly url = '';
  readonly label = 'Local Server';
  readonly queryClient: QueryClient;

  status: ConnectionStatus = 'disconnected';
  error: string | null = null;

  private statusListeners = new Set<
    (status: ConnectionStatus, error: string | null) => void
  >();

  constructor() {
    this.queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          console.error('[LocalConnection QueryError]', {
            queryKey: query.queryKey,
            error,
          });
        },
      }),
      defaultOptions: {
        queries: { staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false },
      },
    });
  }

  private setStatus(status: ConnectionStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((cb) => cb(status, error));
  }

  onStatusChange(
    cb: (status: ConnectionStatus, error: string | null) => void
  ): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      const resp = await window.fetch('/api/config/info', {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      this.setStatus('connected');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      this.setStatus('error', msg);
      throw e;
    }
  }

  disconnect(): void {
    this.setStatus('disconnected');
  }

  async fetch(
    path: string,
    init?: RequestInit,
    _extra?: { timeoutMs?: number }
  ): Promise<Response> {
    return window.fetch(path, { ...init, credentials: 'include' });
  }

  openWs(path: string, query?: string): WebSocketLike {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fullPath = query ? `${path}?${query}` : path;
    return new WebSocket(
      `${proto}//${location.host}${fullPath}`
    ) as unknown as WebSocketLike;
  }

  async listProjects(): Promise<ConnectionProject[]> {
    const resp = await this.fetch('/api/projects');
    if (!resp.ok) throw new Error(`Failed to list projects: ${resp.status}`);
    const envelope = await resp.json();
    const items = (envelope.data ?? envelope) as Array<{
      id: string;
      name: string;
      path?: string;
    }>;
    return items.map((p) => ({
      id: String(p.id),
      name: p.name,
      path: p.path,
    }));
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/connections/localConnection.ts
git commit -m "feat(connections): add LocalConnection for same-origin requests"
```

---

### Task 3: Extract `ProjectListView` from `MachineProjectsTab`

**Files:**
- Create: `frontend/src/components/tabs/ProjectListView.tsx`
- Modify: `frontend/src/components/tabs/MachineProjectsTab.tsx:103-263`

- [ ] **Step 1: Create `ProjectListView.tsx`**

Extract the `ProjectListView` and `ProjectCardSimple` components from `MachineProjectsTab.tsx` into a new file. The key change: instead of reading the connection from `connection-store` via `tab.connectionId`, use `useConnection()` from context. Accept an `onOpenProject` callback prop instead of calling `openProjectTab` directly.

Create `frontend/src/components/tabs/ProjectListView.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  Plus,
  Pin,
  ExternalLink,
  MoreHorizontal,
  AlertCircle,
} from 'lucide-react';
import { useConnection } from '@/contexts/ConnectionContext';
import type { ConnectionProject } from '@/lib/connections/types';

interface ProjectListViewProps {
  subtitle?: string;
  onOpenProject: (project: ConnectionProject) => void;
}

export function ProjectListView({
  subtitle,
  onOpenProject,
}: ProjectListViewProps) {
  const conn = useConnection();
  const [projects, setProjects] = useState<ConnectionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    setLoading(true);
    setError(null);
    conn
      .listProjects()
      .then(setProjects)
      .catch((e: unknown) => {
        setProjects([]);
        setError(e instanceof Error ? e.message : 'Failed to load projects');
      })
      .finally(() => setLoading(false));
  }, [conn]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            {subtitle && (
              <p className="text-sm text-foreground/50">{subtitle}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin mr-2 text-foreground/50" />
            <span className="text-sm text-foreground/50">
              Loading projects...
            </span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
            <p className="mt-2 text-sm text-foreground/50">
              This machine has no projects.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCardSimple
                key={project.id}
                project={project}
                onSelect={() => onOpenProject(project)}
                onPin={() => onOpenProject(project)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCardSimple({
  project,
  onSelect,
  onPin,
}: {
  project: ConnectionProject;
  onSelect: () => void;
  onPin: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="border border-border rounded-lg p-4 bg-background hover:shadow-md transition-shadow cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold truncate flex-1">
          {project.name}
        </h3>
        <div className="relative shrink-0 ml-2">
          <button
            className="p-1 rounded hover:bg-foreground/10"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal size={16} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[160px]">
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-foreground/5"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                  setShowMenu(false);
                }}
              >
                <Pin size={14} /> Pin to tab bar
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-foreground/5"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                  setShowMenu(false);
                }}
              >
                <ExternalLink size={14} /> Open
              </button>
            </div>
          )}
        </div>
      </div>
      {project.path && (
        <p className="text-sm text-foreground/40 mt-1 truncate">
          {project.path}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `MachineProjectsTab` to use extracted `ProjectListView`**

In `frontend/src/components/tabs/MachineProjectsTab.tsx`, replace the inline `ProjectListView` and `ProjectCardSimple` (lines 103-263) with an import of the new component. The `MachineProjectsTab` already wraps content in `ConnectionProvider`, so `useConnection()` inside `ProjectListView` will work.

Remove the `ProjectListView` function and `ProjectCardSimple` function from the file (lines 103-263). Also remove the now-unused imports: `Plus`, `Pin`, `ExternalLink`, `MoreHorizontal`, `AlertCircle`, and `ConnectionProject` type.

Replace the render at line 97 (`<ProjectListView tab={tab} />`) with:

```tsx
<ProjectListView
  subtitle={tab.label}
  onOpenProject={(project) => {
    if (!tab.connectionId) return;
    openProjectTab(
      tab.connectionId,
      tab.machineId,
      project.id,
      project.name
    );
  }}
/>
```

Add the import at the top:
```ts
import { ProjectListView } from './ProjectListView';
```

Add `openProjectTab` to the destructured store values. The full updated component should look like:

```tsx
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';
import { GatewayMachineConnection } from '@/lib/connections/gatewayConnection';
import type { TabPersisted } from '@/lib/connections/types';
import { ProjectListView } from './ProjectListView';

export function MachineProjectsTab({ tab }: { tab: TabPersisted }) {
  const getConnection = useConnectionStore((s) => s.getConnection);
  const { openProjectTab } = useConnectionStore();
  const conn = tab.connectionId
    ? getConnection(tab.connectionId, tab.machineId)
    : null;

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    return conn.onStatusChange(() => setTick((t) => t + 1));
  }, [conn]);

  useEffect(() => {
    if (!conn || !(conn instanceof GatewayMachineConnection)) return;
    conn.addRef();
    return () => conn.removeRef();
  }, [conn]);

  useEffect(() => {
    if (!conn) return;
    if (conn.status === 'disconnected' || conn.status === 'error') {
      conn.connect().catch(() => {});
    }
  }, [conn, conn?.status]);

  if (!conn) {
    return (
      <div className="flex items-center justify-center h-full text-foreground/50 text-sm">
        Connection not found. The connection may have been removed.
      </div>
    );
  }

  if (conn.status === 'connecting' || conn.status === 'reconnecting') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-foreground/60" />
          <p className="text-foreground/60 text-sm">
            {conn.status === 'reconnecting'
              ? conn.error || 'Reconnecting...'
              : 'Connecting...'}
          </p>
        </div>
      </div>
    );
  }

  if (conn.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-destructive text-sm">
            {conn.error || 'Connection error'}
          </p>
          <button
            className="px-3 py-1.5 text-sm bg-foreground text-background rounded hover:opacity-85"
            onClick={() => conn.connect().catch(() => {})}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (conn.status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full text-foreground/50 text-sm">
        Not connected
      </div>
    );
  }

  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <ProjectListView
          subtitle={tab.label}
          onOpenProject={(project) => {
            if (!tab.connectionId) return;
            openProjectTab(
              tab.connectionId,
              tab.machineId,
              project.id,
              project.name
            );
          }}
        />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tabs/ProjectListView.tsx frontend/src/components/tabs/MachineProjectsTab.tsx
git commit -m "refactor(tabs): extract ProjectListView into shared component"
```

---

### Task 4: Create `LocalDirectShell`

**Files:**
- Create: `frontend/src/components/tabs/LocalDirectShell.tsx`

This is the top-level shell for local-direct mode. It manages:
1. A `LocalConnection` singleton.
2. Auto-connect on mount with loading/error states.
3. Lightweight tab state: a project list as the default view, plus project tabs.
4. Keyboard shortcuts (Ctrl+1-9 tab switching, Ctrl+W close).

- [ ] **Step 1: Create `LocalDirectShell.tsx`**

Create `frontend/src/components/tabs/LocalDirectShell.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/LocalDirectShell.tsx
git commit -m "feat(tabs): add LocalDirectShell for local-direct auto-connect mode"
```

---

### Task 5: Wire `TabShell` to branch on `VITE_APP_MODE`

**Files:**
- Modify: `frontend/src/components/tabs/TabShell.tsx`

- [ ] **Step 1: Update `TabShell` to conditionally render `LocalDirectShell`**

Replace the entire content of `frontend/src/components/tabs/TabShell.tsx` with:

```tsx
import { isLocalDirect } from '@/lib/isLocalDirect';
import { LocalDirectShell } from './LocalDirectShell';
import { MultiConnectionShell } from './MultiConnectionShell';

export function TabShell() {
  if (isLocalDirect) {
    return <LocalDirectShell />;
  }
  return <MultiConnectionShell />;
}
```

- [ ] **Step 2: Rename the old `TabShell` content to `MultiConnectionShell`**

Create `frontend/src/components/tabs/MultiConnectionShell.tsx` with the exact current content of `TabShell.tsx` (before step 1), but rename the export from `TabShell` to `MultiConnectionShell`:

```tsx
import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { TabBar } from './TabBar';
import { HomeTab } from './HomeTab';
import { ProjectTab } from './ProjectTab';
import { MachineProjectsTab } from './MachineProjectsTab';

export function MultiConnectionShell() {
  const { initialized, init, tabs, activeTabId, closeTab, setActiveTab } =
    useConnectionStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx === 0) {
          setActiveTab('home');
        } else {
          const tab = tabs[idx - 1];
          if (tab) setActiveTab(tab.id);
        }
      }
      if (e.ctrlKey && e.key === 'w') {
        if (activeTabId !== 'home') {
          e.preventDefault();
          closeTab(activeTabId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, setActiveTab, closeTab]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        <div
          className={`h-full overflow-auto ${activeTabId === 'home' ? '' : 'hidden'}`}
        >
          <HomeTab />
        </div>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${activeTabId === tab.id ? '' : 'hidden'}`}
          >
            {tab.type === 'machine-projects' ? (
              <MachineProjectsTab tab={tab} />
            ) : (
              <ProjectTab tab={tab} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tabs/TabShell.tsx frontend/src/components/tabs/MultiConnectionShell.tsx
git commit -m "feat(tabs): branch TabShell on VITE_APP_MODE for local-direct vs multi-connection"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start dev server and verify local-direct mode**

Run: `pnpm run dev`

Expected:
- The frontend opens and automatically connects to the local backend (no HomeTab, no "Add Connection" form).
- The project list is displayed immediately.
- Clicking a project opens a project tab.
- The tab bar appears when project tabs are open.
- Ctrl+W closes the active project tab.
- Ctrl+1 switches to the Projects tab, Ctrl+2+ switches to project tabs.

- [ ] **Step 2: Verify multi-connection mode still works**

Run: `cd frontend && VITE_APP_MODE= npx vite --port 3000`

(Start frontend without `VITE_APP_MODE` set — the backend should be running separately.)

Expected:
- The HomeTab appears with the connection list.
- The "Add Connection" form works as before.
- Adding a Direct connection and clicking it opens MachineProjectsTab with the project list.
- All existing functionality is unchanged.

- [ ] **Step 3: Verify type-check passes**

Run: `pnpm run check`

Expected: no type errors.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -u
git commit -m "fix: address issues found during manual verification"
```
