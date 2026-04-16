# Fix Project Tab Navigation & State Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs — duplicate projects page when opening a project from MachineProjectsTab, and tab state loss when switching between tabs.

**Architecture:** Replace `BrowserRouter` with `MemoryRouter` in tab-embedded `App` instances so each tab has isolated routing. Remove the embedded App (View B) from `MachineProjectsTab` — clicking a project now opens a dedicated `ProjectTab` via `openProjectTab()`.

**Tech Stack:** React, React Router v6 (`MemoryRouter`), Zustand (connection-store)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/App.tsx` | Modify | Add `initialPath` prop; conditionally use `MemoryRouter` vs `BrowserRouter` |
| `frontend/src/components/tabs/MachineProjectsTab.tsx` | Modify | Remove View B (embedded App); click handler calls `openProjectTab()` |
| `frontend/src/components/tabs/ProjectTab.tsx` | Modify | Pass `initialPath` to `<App />` |

---

### Task 1: Add `initialPath` prop to App and use MemoryRouter

**Files:**
- Modify: `frontend/src/App.tsx:1-165`

- [ ] **Step 1: Add MemoryRouter import and initialPath prop**

In `frontend/src/App.tsx`, add `MemoryRouter` to the existing `react-router-dom` import on line 2, and add a props interface for `App`:

```tsx
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
```

- [ ] **Step 2: Make App accept an optional `initialPath` prop and conditionally use MemoryRouter**

Change the `App` function (lines 151-163) from:

```tsx
function App() {
  return (
    <BrowserRouter>
      <UserSystemProvider>
        <ClickedElementsProvider>
          <ProjectProvider>
            <AppContent />
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}
```

To:

```tsx
function App({ initialPath }: { initialPath?: string }) {
  const Router = initialPath ? MemoryRouter : BrowserRouter;
  const routerProps = initialPath ? { initialEntries: [initialPath] } : {};

  return (
    <Router {...routerProps}>
      <UserSystemProvider>
        <ClickedElementsProvider>
          <ProjectProvider>
            <AppContent />
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </Router>
  );
}
```

- [ ] **Step 3: Verify type check passes**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/5304-project-bug/vibe-kanban && pnpm run check`
Expected: No new type errors related to App or MemoryRouter.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(tabs): add initialPath prop to App for MemoryRouter isolation"
```

---

### Task 2: Pass `initialPath` to App in ProjectTab

**Files:**
- Modify: `frontend/src/components/tabs/ProjectTab.tsx:86-92`

- [ ] **Step 1: Pass initialPath to App**

In `frontend/src/components/tabs/ProjectTab.tsx`, change the return block (lines 86-92) from:

```tsx
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <App />
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

To:

```tsx
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <App initialPath={`/local-projects/${tab.projectId}/tasks`} />
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

- [ ] **Step 2: Verify type check passes**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/5304-project-bug/vibe-kanban && pnpm run check`
Expected: No new type errors. `tab.projectId` exists on `TabPersisted`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/ProjectTab.tsx
git commit -m "feat(tabs): use MemoryRouter in ProjectTab for route isolation"
```

---

### Task 3: Remove View B from MachineProjectsTab, use openProjectTab

**Files:**
- Modify: `frontend/src/components/tabs/MachineProjectsTab.tsx:1-294`

- [ ] **Step 1: Clean up imports — remove unused App import and ArrowLeft icon**

In `frontend/src/components/tabs/MachineProjectsTab.tsx`, remove the `App` import (line 17) and `ArrowLeft` from the lucide imports (line 5):

Change line 2-17 from:

```tsx
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
```

To:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
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
```

- [ ] **Step 2: Remove activeProjectId state and View B block**

In the `MachineProjectsTab` function, remove the `activeProjectId` state (line 48) and the entire View B conditional block (lines 99-121).

Remove this line:

```tsx
  // Internal navigation: null = project list, string = project detail
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
```

Remove this entire block (lines 99-121):

```tsx
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
```

- [ ] **Step 3: Update ProjectListView to call openProjectTab directly on click**

In `ProjectListView`, change the `onSelectProject` prop usage. The component already has `openProjectTab` from the store (line 142) and `handlePin` calls it (line 172). We need to make `onSelectProject` also call `openProjectTab`.

Change the `ProjectListView` props interface and the parent call site. In the `MachineProjectsTab` return block (around line 124-130), change:

```tsx
  // View A: Project list
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <ProjectListView tab={tab} onSelectProject={setActiveProjectId} />
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

To:

```tsx
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <ProjectListView tab={tab} />
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

Then update the `ProjectListView` function signature and click handler. Change the function (lines 135-227) from:

```tsx
function ProjectListView({
  tab,
  onSelectProject,
}: {
  tab: TabPersisted;
  onSelectProject: (projectId: string) => void;
}) {
  const { openProjectTab } = useConnectionStore();
```

To:

```tsx
function ProjectListView({ tab }: { tab: TabPersisted }) {
  const { openProjectTab } = useConnectionStore();
```

Then update `handlePin` to also be used for opening projects. Add a new `handleOpen` function and update the card callbacks. After the existing `handlePin` (line 170-173), add:

```tsx
  const handleOpen = (project: ConnectionProject) => {
    if (!tab.connectionId) return;
    openProjectTab(tab.connectionId, tab.machineId, project.id, project.name);
  };
```

Then update the `ProjectCardSimple` usage inside the grid (lines 214-220) from:

```tsx
              <ProjectCardSimple
                key={project.id}
                project={project}
                onSelect={() => onSelectProject(project.id)}
                onPin={() => handlePin(project)}
              />
```

To:

```tsx
              <ProjectCardSimple
                key={project.id}
                project={project}
                onSelect={() => handleOpen(project)}
                onPin={() => handlePin(project)}
              />
```

- [ ] **Step 4: Verify type check passes**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/5304-project-bug/vibe-kanban && pnpm run check`
Expected: No type errors. All removed code was self-contained.

- [ ] **Step 5: Verify lint passes**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/5304-project-bug/vibe-kanban && pnpm run lint`
Expected: No lint errors from the changes (no unused imports, no unused variables).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/tabs/MachineProjectsTab.tsx
git commit -m "fix(tabs): remove embedded App from MachineProjectsTab, use openProjectTab"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Verify the app builds**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/5304-project-bug/vibe-kanban && pnpm run check && pnpm run lint`
Expected: Clean pass with no errors.

- [ ] **Step 2: Document verification checklist**

Verify these scenarios manually when running the app:

1. **Machine tab → click project**: Opens a new ProjectTab (or activates existing one), not an embedded App. Machine tab stays on project list.
2. **ProjectTab shows tasks**: The opened ProjectTab should show the project's kanban board directly (not the old ProjectList page).
3. **Tab state preservation**: Open a project tab, navigate to a specific task, switch to Home tab, switch back — the task should still be visible.
4. **Pin to tab bar**: The "Pin to tab bar" button in MachineProjectsTab still works (opens a ProjectTab).
5. **In-tab navigation**: Within a ProjectTab, clicking a different project card in the sidebar navigates within the same MemoryRouter (stays in the tab).
