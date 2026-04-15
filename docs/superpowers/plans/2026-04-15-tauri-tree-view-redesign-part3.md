# Tauri Tree View Redesign — Part 3 (Tasks 5–6)

Continues from `2026-04-15-tauri-tree-view-redesign-part2.md`.

---

## Task 5: Create MachineProjectsTab component

**Files:**
- Create: `frontend/src/components/tabs/MachineProjectsTab.tsx`

This is the core new component. It has two internal views:
- **View A (list)**: Shows projects fetched via `UnifiedConnection.listProjects()` in a card grid. Includes "Pin to tab bar" action on each card.
- **View B (detail)**: Renders the full `App` workspace for a selected project, same as `ProjectTab`.

**Note on "Create Project"**: `ProjectFormDialog` requires `NiceModal.Provider` which lives inside `App` (via `LegacyDesignScope`). Since View A doesn't render inside `App`, we can't use `ProjectFormDialog.show()` from the list. The user can create projects from within View B (which renders `App` with full providers). This is acceptable for the initial implementation.

- [ ] **Step 1: Create MachineProjectsTab.tsx**

Create `frontend/src/components/tabs/MachineProjectsTab.tsx`:

```typescript
// frontend/src/components/tabs/MachineProjectsTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Pin,
  ExternalLink,
  MoreHorizontal,
  AlertCircle,
} from 'lucide-react';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';
import { GatewayMachineConnection } from '@/lib/connections/gatewayConnection';
import type { TabPersisted, ConnectionProject } from '@/lib/connections/types';
import App from '@/App';

export function MachineProjectsTab({ tab }: { tab: TabPersisted }) {
  const getConnection = useConnectionStore((s) => s.getConnection);
  const conn = tab.connectionId
    ? getConnection(tab.connectionId, tab.machineId)
    : null;

  // Subscribe to connection status changes
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    return conn.onStatusChange(() => setTick((t) => t + 1));
  }, [conn]);

  // Manage ref counting for gateway connections
  useEffect(() => {
    if (!conn || !(conn instanceof GatewayMachineConnection)) return;
    conn.addRef();
    return () => conn.removeRef();
  }, [conn]);

  // Auto-connect
  useEffect(() => {
    if (!conn) return;
    if (conn.status === 'disconnected' || conn.status === 'error') {
      conn.connect().catch(() => {});
    }
  }, [conn, conn?.status]);

  // Internal navigation: null = project list, string = project detail
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

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

  // View B: Project detail (full App workspace)
  if (activeProjectId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <button
            className="flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground"
            onClick={() => setActiveProjectId(null)}
          >
            <ArrowLeft size={16} />
            Back to projects
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <ConnectionProvider connection={conn}>
            <QueryClientProvider client={conn.queryClient}>
              <App />
            </QueryClientProvider>
          </ConnectionProvider>
        </div>
      </div>
    );
  }

  // View A: Project list
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <ProjectListView
          tab={tab}
          onSelectProject={setActiveProjectId}
        />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}

// -- Project List View (View A) --

function ProjectListView({
  tab,
  onSelectProject,
}: {
  tab: TabPersisted;
  onSelectProject: (projectId: string) => void;
}) {
  const { openProjectTab } = useConnectionStore();
  const [projects, setProjects] = useState<ConnectionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getConnection = useConnectionStore((s) => s.getConnection);
  const conn = tab.connectionId
    ? getConnection(tab.connectionId, tab.machineId)
    : null;

  const loadProjects = useCallback(() => {
    if (!conn) return;
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

  const handlePin = (project: ConnectionProject) => {
    if (!tab.connectionId) return;
    openProjectTab(tab.connectionId, tab.machineId, project.id, project.name);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-sm text-foreground/50">{tab.label}</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Loading */}
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
                onSelect={() => onSelectProject(project.id)}
                onPin={() => handlePin(project)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Simple Project Card for the list view --

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

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/MachineProjectsTab.tsx
git commit -m "feat(tabs): add MachineProjectsTab with project list and detail views"
```

---

## Task 6: Wire MachineProjectsTab into TabShell

**Files:**
- Modify: `frontend/src/components/tabs/TabShell.tsx`

- [ ] **Step 1: Update TabShell to render MachineProjectsTab**

Replace the full content of `frontend/src/components/tabs/TabShell.tsx`:

```typescript
// frontend/src/components/tabs/TabShell.tsx
import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { TabBar } from './TabBar';
import { HomeTab } from './HomeTab';
import { ProjectTab } from './ProjectTab';
import { MachineProjectsTab } from './MachineProjectsTab';

export function TabShell() {
  const { initialized, init, tabs, activeTabId, closeTab, setActiveTab } =
    useConnectionStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+1~9: switch to tab by position
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

      // Ctrl+W: close active tab
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
        {/* Home tab */}
        <div
          className={`h-full overflow-auto ${activeTabId === 'home' ? '' : 'hidden'}`}
        >
          <HomeTab />
        </div>

        {/* All tabs — keep mounted to preserve state, hide inactive */}
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

Changes from original:
- Import `MachineProjectsTab`
- Render `MachineProjectsTab` for `type === 'machine-projects'`, `ProjectTab` for everything else

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/TabShell.tsx
git commit -m "feat(tabs): wire MachineProjectsTab into TabShell"
```

---

## Task 7: Manual integration test

- [ ] **Step 1: Start dev server**

Run: `pnpm run dev`

- [ ] **Step 2: Verify Home tab**

1. Open the Tauri app (or the dev server in browser)
2. Verify the "Connections" header is larger (text-xl)
3. Verify Direct connections show as clickable rows without project expansion
4. Verify Gateway connections expand to show machine list
5. Verify machine list has scroll (`max-h-[400px]`) if you have many machines
6. Verify unpaired machines show pairing UI on click
7. Verify all fonts, icons, paddings are visually larger

- [ ] **Step 3: Verify MachineProjectsTab**

1. Click a Direct connection → should open a new "Projects" tab
2. Verify tab appears in TabBar with Monitor icon
3. Verify project cards are shown in a grid
4. Click a project card → should navigate to project detail within the tab
5. Click "Back to projects" → should return to project list
6. Click a project card's "..." menu → "Pin to tab bar" → should create an independent ProjectTab

- [ ] **Step 4: Verify TabBar**

1. Verify all tabs have larger text and padding
2. Verify Ctrl+1-9 switching still works
3. Verify Ctrl+W closes the active tab
4. Verify clicking the same machine again focuses the existing tab (no duplicates)

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration test findings"
```
