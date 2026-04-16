# Unified Terminal Bottom Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify two duplicate terminal systems (task-level aux panel + global right drawer) into a single bottom drawer in `NormalLayout` with multi-context tab support.

**Architecture:** Remove all terminal logic from `TasksLayout`/`AttemptHeaderActions`/`ProjectTasks`. Merge `TerminalDrawerContext` into `TerminalContext`. Render a single `TerminalBottomDrawer` in `NormalLayout` using `react-resizable-panels` with keep-alive via collapsible panel. Tab bar gets a context-aware "+" dropdown (task/project/home).

**Tech Stack:** React, TypeScript, react-resizable-panels, xterm.js (unchanged), Tailwind CSS (legacy design)

**Spec:** `docs/superpowers/specs/2026-04-16-unified-terminal-drawer-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/contexts/TerminalContext.tsx` | Add drawer open/close state, `TerminalTabContext` type, `context` field on `TerminalTab` |
| Delete | `frontend/src/contexts/TerminalDrawerContext.tsx` | Replaced by merged `TerminalContext` |
| Modify | `frontend/src/components/panels/TerminalTabBar.tsx` | Add "+" dropdown with context options |
| Modify | `frontend/src/components/panels/TerminalPanel.tsx` | Accept `availableContexts` prop, pass to tab bar |
| Create | `frontend/src/components/layout/TerminalBottomDrawer.tsx` | Bottom drawer wrapper: resizable panel + TerminalPanel |
| Modify | `frontend/src/components/layout/NormalLayout.tsx` | Replace right drawer with bottom resizable panel layout |
| Modify | `frontend/src/components/layout/Navbar.tsx` | Use `useTerminal()` instead of `useTerminalDrawer()` |
| Modify | `frontend/src/components/layout/TasksLayout.tsx` | Remove `terminal` prop and `'terminal'` from `LayoutMode` |
| Modify | `frontend/src/components/panels/AttemptHeaderActions.tsx` | Remove terminal toggle button |
| Modify | `frontend/src/pages/ProjectTasks.tsx` | Remove terminal content, cwd computation, cycle view entry |
| Modify | `frontend/src/App.tsx` | Remove `TerminalDrawerProvider` |

---

### Task 1: Add drawer state and tab context to TerminalContext

**Files:**
- Modify: `frontend/src/contexts/TerminalContext.tsx`

- [ ] **Step 1: Add `TerminalTabContext` type and `context` field to `TerminalTab`**

In `frontend/src/contexts/TerminalContext.tsx`, add the type after the existing imports and before the `STORAGE_KEY`:

```typescript
export type TerminalTabContext =
  | { type: 'task'; attemptId: string; taskId: string }
  | { type: 'project'; projectId: string }
  | { type: 'home' };
```

Add `context` field to `TerminalTab` interface:

```typescript
export interface TerminalTab {
  id: string;
  title: string;
  workspaceId: string;
  taskId: string;
  cwd: string;
  sessionId: string | null;
  context: TerminalTabContext;
}
```

- [ ] **Step 2: Add `isDrawerOpen` to state and reducer**

Add to `TerminalState` interface:

```typescript
interface TerminalState {
  tabsByWorkspace: Record<string, TerminalTab[]>;
  activeTabByWorkspace: Record<string, string | null>;
  closedWorkspaces: string[];
  tabCounterByWorkspace: Record<string, number>;
  isDrawerOpen: boolean;
}
```

Update `loadPersistedState` to include `isDrawerOpen`:

```typescript
function loadPersistedState(): TerminalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        tabsByWorkspace: {},
        activeTabByWorkspace: {},
        closedWorkspaces: [],
        tabCounterByWorkspace: {},
        isDrawerOpen: false,
      };
    const parsed = JSON.parse(raw);
    return {
      tabsByWorkspace: parsed.tabsByWorkspace || {},
      activeTabByWorkspace: parsed.activeTabByWorkspace || {},
      closedWorkspaces: parsed.closedWorkspaces || [],
      tabCounterByWorkspace: parsed.tabCounterByWorkspace || {},
      isDrawerOpen: parsed.isDrawerOpen ?? false,
    };
  } catch {
    return {
      tabsByWorkspace: {},
      activeTabByWorkspace: {},
      closedWorkspaces: [],
      tabCounterByWorkspace: {},
      isDrawerOpen: false,
    };
  }
}
```

Add new action types to `TerminalAction`:

```typescript
type TerminalAction =
  | { type: 'CREATE_TAB'; workspaceId: string; taskId: string; cwd: string; context: TerminalTabContext }
  | { type: 'CLOSE_TAB'; workspaceId: string; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; workspaceId: string; tabId: string }
  | { type: 'UPDATE_TAB_TITLE'; workspaceId: string; tabId: string; title: string }
  | { type: 'CLEAR_WORKSPACE_TABS'; workspaceId: string }
  | { type: 'SET_SESSION_ID'; workspaceId: string; tabId: string; sessionId: string | null }
  | { type: 'OPEN_DRAWER' }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'TOGGLE_DRAWER' };
```

Add `context` to `CREATE_TAB` case in the reducer, storing it on the new tab:

```typescript
case 'CREATE_TAB': {
  const { workspaceId, taskId, cwd, context } = action;
  const existingTabs = state.tabsByWorkspace[workspaceId] || [];
  const nextCounter = (state.tabCounterByWorkspace[workspaceId] || 0) + 1;
  const newTab: TerminalTab = {
    id: generateTabId(),
    title: `Terminal ${nextCounter}`,
    workspaceId,
    taskId,
    cwd,
    sessionId: null,
    context,
  };
  // ... rest unchanged
}
```

Add the drawer action cases to the reducer:

```typescript
case 'OPEN_DRAWER':
  return { ...state, isDrawerOpen: true };

case 'CLOSE_DRAWER':
  return { ...state, isDrawerOpen: false };

case 'TOGGLE_DRAWER':
  return { ...state, isDrawerOpen: !state.isDrawerOpen };
```

- [ ] **Step 3: Add drawer methods to context type and provider**

Update `TerminalContextType`:

```typescript
interface TerminalContextType {
  getTabsForWorkspace: (workspaceId: string) => TerminalTab[];
  getActiveTab: (workspaceId: string) => TerminalTab | null;
  hasTerminalForTask: (taskId: string) => boolean;
  isWorkspaceClosed: (workspaceId: string) => boolean;
  createTab: (workspaceId: string, taskId: string, cwd: string, context: TerminalTabContext) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  setActiveTab: (workspaceId: string, tabId: string) => void;
  updateTabTitle: (workspaceId: string, tabId: string, title: string) => void;
  clearWorkspaceTabs: (workspaceId: string) => void;
  setSessionId: (workspaceId: string, tabId: string, sessionId: string | null) => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  getAllTabs: () => TerminalTab[];
  getActiveGlobalTab: () => TerminalTab | null;
  setActiveGlobalTab: (tabId: string) => void;
}
```

Add `getAllTabs` (flat list of all tabs across workspaces — needed by the bottom panel to show all tabs in a single bar), `getActiveGlobalTab` (whichever tab is globally active), and `setActiveGlobalTab`.

In `TerminalProvider`, add to state: a `globalActiveTabId: string | null` field (also persisted). Add the corresponding callbacks:

```typescript
const createTab = useCallback(
  (workspaceId: string, taskId: string, cwd: string, context: TerminalTabContext) => {
    dispatch({ type: 'CREATE_TAB', workspaceId, taskId, cwd, context });
  },
  []
);

const openDrawer = useCallback(() => {
  dispatch({ type: 'OPEN_DRAWER' });
}, []);

const closeDrawer = useCallback(() => {
  dispatch({ type: 'CLOSE_DRAWER' });
}, []);

const toggleDrawer = useCallback(() => {
  dispatch({ type: 'TOGGLE_DRAWER' });
}, []);

const getAllTabs = useCallback((): TerminalTab[] => {
  return Object.values(state.tabsByWorkspace).flat();
}, [state.tabsByWorkspace]);
```

Add `globalActiveTabId: string | null` to `TerminalState` and `loadPersistedState` (default `null`). Add action:

```typescript
| { type: 'SET_GLOBAL_ACTIVE_TAB'; tabId: string }
```

In the reducer, `CREATE_TAB` also sets `globalActiveTabId` to `newTab.id`:

```typescript
case 'CREATE_TAB': {
  // ... existing tab creation code ...
  return {
    ...state,
    tabsByWorkspace: { ...state.tabsByWorkspace, [workspaceId]: [...existingTabs, newTab] },
    activeTabByWorkspace: { ...state.activeTabByWorkspace, [workspaceId]: newTab.id },
    closedWorkspaces: state.closedWorkspaces.filter((id) => id !== workspaceId),
    tabCounterByWorkspace: { ...state.tabCounterByWorkspace, [workspaceId]: nextCounter },
    globalActiveTabId: newTab.id,
  };
}

case 'SET_GLOBAL_ACTIVE_TAB':
  return { ...state, globalActiveTabId: action.tabId };
```

In the `CLOSE_TAB` case, if the closed tab was the global active tab, set `globalActiveTabId` to the next tab in the same workspace (or `null` if no tabs remain anywhere):

```typescript
case 'CLOSE_TAB': {
  // ... existing close logic ...
  let globalActiveTabId = state.globalActiveTabId;
  if (globalActiveTabId === tabId) {
    globalActiveTabId = newActiveTab; // from per-workspace logic above
    if (!globalActiveTabId) {
      // Find any remaining tab across all workspaces
      const allTabs = Object.values({ ...state.tabsByWorkspace, [workspaceId]: newTabs }).flat();
      globalActiveTabId = allTabs[0]?.id ?? null;
    }
  }
  return { ...state, /* existing fields */, globalActiveTabId };
}
```

Add the provider callbacks:

```typescript
const getActiveGlobalTab = useCallback((): TerminalTab | null => {
  const tabId = state.globalActiveTabId;
  if (!tabId) return null;
  for (const tabs of Object.values(state.tabsByWorkspace)) {
    const found = tabs.find((t) => t.id === tabId);
    if (found) return found;
  }
  return null;
}, [state.globalActiveTabId, state.tabsByWorkspace]);

const setActiveGlobalTab = useCallback((tabId: string) => {
  dispatch({ type: 'SET_GLOBAL_ACTIVE_TAB', tabId });
}, []);
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd frontend && pnpm run check`

Expected: Type errors in files that call `createTab` without the `context` arg — these will be fixed in later tasks. The context file itself should be clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/TerminalContext.tsx
git commit -m "feat(terminal): add drawer state and tab context to TerminalContext"
```

---

### Task 2: Remove TerminalDrawerContext and update App.tsx

**Files:**
- Delete: `frontend/src/contexts/TerminalDrawerContext.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Remove `TerminalDrawerProvider` from App.tsx**

In `frontend/src/App.tsx`, remove the import on line 31:

```typescript
// DELETE this line:
import { TerminalDrawerProvider } from '@/contexts/TerminalDrawerContext';
```

Remove the `<TerminalDrawerProvider>` wrapper around `SentryRoutes` (lines 108 and 149). The JSX becomes:

```tsx
<TerminalProvider>
  <SentryRoutes>
    {/* ... routes unchanged ... */}
  </SentryRoutes>
</TerminalProvider>
```

- [ ] **Step 2: Delete TerminalDrawerContext.tsx**

```bash
rm frontend/src/contexts/TerminalDrawerContext.tsx
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git add frontend/src/contexts/TerminalDrawerContext.tsx
git commit -m "refactor(terminal): remove TerminalDrawerContext, merge into TerminalContext"
```

---

### Task 3: Remove terminal from TasksLayout and AttemptHeaderActions

**Files:**
- Modify: `frontend/src/components/layout/TasksLayout.tsx`
- Modify: `frontend/src/components/panels/AttemptHeaderActions.tsx`

- [ ] **Step 1: Remove `'terminal'` from `LayoutMode` in TasksLayout.tsx**

In `frontend/src/components/layout/TasksLayout.tsx`, change line 11:

```typescript
// Before:
export type LayoutMode = 'preview' | 'diffs' | 'commits' | 'terminal' | null;

// After:
export type LayoutMode = 'preview' | 'diffs' | 'commits' | null;
```

- [ ] **Step 2: Remove `terminal` prop from `TasksLayoutProps` and `TasksLayout`**

Remove `terminal?: ReactNode` from `TasksLayoutProps` interface (line 19). Remove `terminal` from the destructured props in `TasksLayout` function (line 246 area).

- [ ] **Step 3: Simplify `AuxRouter` — remove terminal handling**

In the `AuxRouter` function, remove the `terminal` prop, the `hasEverMountedTerminal` ref, and the terminal div. The entire function simplifies to:

```tsx
function AuxRouter({
  mode,
  aux,
}: {
  mode: LayoutMode;
  aux: ReactNode;
}) {
  return (
    <div className="h-full min-h-0 relative">
      <AnimatePresence initial={false} mode="popLayout">
        {(mode === 'preview' || mode === 'diffs' || mode === 'commits') && (
          <motion.div
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="h-full min-h-0"
          >
            {aux}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Remove `terminal` from `RightWorkArea` and `DesktopSimple`**

Remove the `terminal` prop from `RightWorkArea` function signature and its pass-through to `AuxRouter`. Remove from `DesktopSimple` function signature and its pass-through to `RightWorkArea`. In `RightWorkArea`, remove `'Terminal'` from the `auxLabel` ternary (the fallback case is no longer reachable, but keep `'Commits'` as the last branch).

Update `auxLabel`:
```typescript
const auxLabel =
  mode === 'preview'
    ? 'Preview'
    : mode === 'diffs'
      ? 'Diffs'
      : 'Commits';
```

- [ ] **Step 5: Remove mobile terminal handling**

In the `TasksLayout` component's mobile branch (line 258 area), the `AuxRouter` call no longer needs `terminal`. It's already not passed there (mobile never had terminal), so no change needed.

- [ ] **Step 6: Remove terminal toggle from AttemptHeaderActions**

In `frontend/src/components/panels/AttemptHeaderActions.tsx`, remove the `SquareTerminal` import from lucide-react (line 7). Remove the entire terminal `<Tooltip>` block (lines 140-153):

```tsx
// DELETE this entire block:
<Tooltip>
  <TooltipTrigger asChild>
    <ToggleGroupItem
      value="terminal"
      aria-label="Terminal"
      active={mode === 'terminal'}
    >
      <SquareTerminal className="h-4 w-4" />
    </ToggleGroupItem>
  </TooltipTrigger>
  <TooltipContent side="bottom">
    {t('attemptHeaderActions.terminal', 'Terminal')}
  </TooltipContent>
</Tooltip>
```

Also remove the `mode === 'terminal'` tracking case from `onValueChange` (lines 66-71):

```typescript
// DELETE:
} else if (newMode === 'terminal') {
  posthog?.capture('terminal_navigated', {
    trigger: 'button',
    timestamp: new Date().toISOString(),
    source: 'frontend',
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/layout/TasksLayout.tsx frontend/src/components/panels/AttemptHeaderActions.tsx
git commit -m "refactor(terminal): remove terminal from TasksLayout and AttemptHeaderActions"
```

---

### Task 4: Clean up ProjectTasks.tsx

**Files:**
- Modify: `frontend/src/pages/ProjectTasks.tsx`

- [ ] **Step 1: Remove terminal-related imports and computations**

In `frontend/src/pages/ProjectTasks.tsx`:

Remove the `TerminalPanel` import (line 83):
```typescript
// DELETE:
import { TerminalPanel } from '@/components/panels/TerminalPanel';
```

Remove the `terminalCwd` computation (lines 354-361):
```typescript
// DELETE entire block:
const terminalCwd = useMemo(() => {
  const containerRef = attempt?.container_ref;
  if (!containerRef) return null;
  const repo = repos[0];
  return attempt.mode === 'worktree' && repo
    ? `${containerRef}/${repo.name}`
    : containerRef;
}, [attempt?.container_ref, attempt?.mode, repos]);
```

Remove the `terminalContent` block (lines 1032-1048):
```typescript
// DELETE entire block:
const terminalContent =
  attempt?.id && taskId && terminalCwd ? (
    <TerminalPanel
      workspaceId={attempt.id}
      taskId={taskId}
      cwd={terminalCwd}
    />
  ) : taskId ? (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {t(
        selectedTask?.status === 'done' ||
          selectedTask?.status === 'cancelled'
          ? 'terminal.workspaceCleanedUp'
          : 'terminal.selectWorkspace'
      )}
    </div>
  ) : null;
```

- [ ] **Step 2: Remove `terminal` from TasksLayout usage**

In the `attemptArea` JSX (around line 1085), remove `terminal={terminalContent}` from `<TasksLayout>`:

```tsx
// Before:
<TasksLayout
  kanban={kanbanContent}
  attempt={attemptContent}
  aux={auxContent}
  terminal={terminalContent}
  isPanelOpen={isPanelOpen}
  mode={mode}
  isMobile={isMobile}
  rightHeader={rightHeader}
/>

// After:
<TasksLayout
  kanban={kanbanContent}
  attempt={attemptContent}
  aux={auxContent}
  isPanelOpen={isPanelOpen}
  mode={mode}
  isMobile={isMobile}
  rightHeader={rightHeader}
/>
```

- [ ] **Step 3: Remove `'terminal'` from view cycle and mode validation**

Update `rawMode` validation (around line 386):

```typescript
// Before:
const rawMode = searchParams.get('view') as LayoutMode;
const mode: LayoutMode =
  rawMode === 'preview' ||
  rawMode === 'diffs' ||
  rawMode === 'commits' ||
  rawMode === 'terminal'
    ? rawMode
    : null;

// After:
const rawMode = searchParams.get('view') as LayoutMode;
const mode: LayoutMode =
  rawMode === 'preview' ||
  rawMode === 'diffs' ||
  rawMode === 'commits'
    ? rawMode
    : null;
```

Update `cycleView` order (around line 596):

```typescript
// Before:
const order: LayoutMode[] = [null, 'preview', 'diffs', 'commits', 'terminal'];

// After:
const order: LayoutMode[] = [null, 'preview', 'diffs', 'commits'];
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && pnpm run check`

Expected: Should pass (or show only remaining type errors from `createTab` calls in `TerminalPanel.tsx` which will be fixed in the next task).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProjectTasks.tsx
git commit -m "refactor(terminal): remove terminal from ProjectTasks"
```

---

### Task 5: Update TerminalPanel to use tab contexts and pass to tab bar

**Files:**
- Modify: `frontend/src/components/panels/TerminalPanel.tsx`
- Modify: `frontend/src/components/panels/TerminalTabBar.tsx`

- [ ] **Step 1: Update TerminalPanel props and createTab calls**

In `frontend/src/components/panels/TerminalPanel.tsx`, update the interface and component to work with the new context system. The panel no longer auto-creates a tab on mount — that's handled by the drawer. It receives all tabs across workspaces and renders them.

Replace the entire file content:

```tsx
import { useTerminal } from '@/contexts/TerminalContext';
import type { TerminalTabContext } from '@/contexts/TerminalContext';
import { TerminalTabBar } from './TerminalTabBar';
import { XTermInstance } from './XTermInstance';

export interface NewTabOption {
  label: string;
  context: TerminalTabContext;
  workspaceId: string;
  taskId: string;
  cwd: string;
  disabled?: boolean;
}

interface TerminalPanelProps {
  newTabOptions: NewTabOption[];
}

function buildEndpointUrl(context: TerminalTabContext, cwd: string, workspaceId: string): string {
  if (context.type === 'task') {
    return `/api/terminal/ws?workspace_id=${workspaceId}`;
  }
  return `/api/terminal/direct-ws?cwd=${encodeURIComponent(cwd)}`;
}

export function TerminalPanel({ newTabOptions }: TerminalPanelProps) {
  const {
    getAllTabs,
    getActiveGlobalTab,
    setActiveGlobalTab,
    createTab,
    closeTab,
    setSessionId,
  } = useTerminal();

  const tabs = getAllTabs();
  const activeTab = getActiveGlobalTab();

  const handleNewTab = (option: NewTabOption) => {
    createTab(option.workspaceId, option.taskId, option.cwd, option.context);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-secondary">
      <TerminalTabBar
        tabs={tabs}
        activeTabId={activeTab?.id ?? null}
        onTabSelect={(tabId) => setActiveGlobalTab(tabId)}
        onTabClose={(tabId) => {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) closeTab(tab.workspaceId, tabId);
        }}
        newTabOptions={newTabOptions}
        onNewTab={handleNewTab}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {tabs.map((tab) => {
          const endpointUrl = buildEndpointUrl(tab.context, tab.cwd, tab.workspaceId);
          return (
            <XTermInstance
              key={tab.id}
              endpointUrl={endpointUrl}
              isActive={tab.id === activeTab?.id}
              onClose={() => closeTab(tab.workspaceId, tab.id)}
              sessionId={tab.sessionId}
              onSessionId={(sid) => setSessionId(tab.workspaceId, tab.id, sid)}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update TerminalTabBar with dropdown**

Replace `frontend/src/components/panels/TerminalTabBar.tsx`:

```tsx
import { ChevronDownIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { TerminalTab } from '@/contexts/TerminalContext';
import type { NewTabOption } from './TerminalPanel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  newTabOptions: NewTabOption[];
  onNewTab: (option: NewTabOption) => void;
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  newTabOptions,
  onNewTab,
}: TerminalTabBarProps) {
  const enabledOptions = newTabOptions.filter((o) => !o.disabled);

  return (
    <div className="flex items-center gap-1 border-b border-border bg-secondary px-2 py-1">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1 rounded px-2 py-1 text-sm cursor-pointer',
              tab.id === activeTabId
                ? 'bg-primary text-high'
                : 'text-low hover:bg-primary/50 hover:text-normal'
            )}
            onClick={() => onTabSelect(tab.id)}
          >
            <span className="truncate max-w-[120px]">{tab.title}</span>
            <button
              className={cn(
                'ml-1 rounded p-0.5 hover:bg-secondary',
                tab.id === activeTabId
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              aria-label="Close terminal"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-center h-6 shrink-0 rounded text-low hover:text-normal hover:bg-primary/50 gap-0.5 px-1"
            aria-label="New terminal"
            disabled={enabledOptions.length === 0}
          >
            <PlusIcon className="h-4 w-4" />
            <ChevronDownIcon className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {newTabOptions.map((option, i) => (
            <DropdownMenuItem
              key={i}
              disabled={option.disabled}
              onSelect={() => onNewTab(option)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && pnpm run check`

Expected: May show errors in `NormalLayout.tsx` which still references old APIs — fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/panels/TerminalPanel.tsx frontend/src/components/panels/TerminalTabBar.tsx
git commit -m "feat(terminal): update TerminalPanel and TabBar for unified bottom drawer"
```

---

### Task 6: Create TerminalBottomDrawer and update NormalLayout

**Files:**
- Create: `frontend/src/components/layout/TerminalBottomDrawer.tsx`
- Modify: `frontend/src/components/layout/NormalLayout.tsx`

- [ ] **Step 1: Create TerminalBottomDrawer component**

Create `frontend/src/components/layout/TerminalBottomDrawer.tsx`:

```tsx
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTerminal } from '@/contexts/TerminalContext';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks';
import { useHomeDir } from '@/hooks/useHomeDir';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { TerminalPanel, type NewTabOption } from '@/components/panels/TerminalPanel';

export function TerminalBottomDrawer() {
  const { taskId, attemptId } = useParams<{
    projectId?: string;
    taskId?: string;
    attemptId?: string;
  }>();
  const { projectId } = useProject();
  const { data: repos } = useProjectRepos(projectId);
  const { data: homeDirData } = useHomeDir();

  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const { data: attempt } = useTaskAttemptWithSession(effectiveAttemptId);
  const { repos: attemptRepos } = useAttemptRepo(attempt?.id);

  const terminalCwd = useMemo(() => {
    const containerRef = attempt?.container_ref;
    if (!containerRef) return null;
    const repo = attemptRepos[0];
    return attempt.mode === 'worktree' && repo
      ? `${containerRef}/${repo.name}`
      : containerRef;
  }, [attempt?.container_ref, attempt?.mode, attemptRepos]);

  const newTabOptions = useMemo((): NewTabOption[] => {
    const options: NewTabOption[] = [];

    // Task terminal option
    const hasActiveWorkspace = !!(attempt?.id && taskId && terminalCwd);
    options.push({
      label: 'Task Terminal',
      context: { type: 'task', attemptId: attempt?.id ?? '', taskId: taskId ?? '' },
      workspaceId: attempt?.id ?? '',
      taskId: taskId ?? '',
      cwd: terminalCwd ?? '',
      disabled: !hasActiveWorkspace,
    });

    // Project terminal option
    const repoPath = repos?.[0]?.path ? String(repos[0].path) : null;
    options.push({
      label: 'Project Terminal',
      context: { type: 'project', projectId: projectId ?? '' },
      workspaceId: projectId ? `project-terminal:${projectId}` : '',
      taskId: projectId ? `project-terminal:${projectId}` : '',
      cwd: repoPath ?? '',
      disabled: !projectId || !repoPath,
    });

    // Home directory option
    options.push({
      label: 'Home Directory',
      context: { type: 'home' },
      workspaceId: 'global-terminal',
      taskId: 'global-terminal',
      cwd: homeDirData?.home_dir ?? '',
      disabled: !homeDirData?.home_dir,
    });

    return options;
  }, [attempt?.id, taskId, terminalCwd, projectId, repos, homeDirData]);

  return <TerminalPanel newTabOptions={newTabOptions} />;
}
```

- [ ] **Step 2: Rewrite NormalLayout with bottom resizable panel**

Replace the content of `frontend/src/components/layout/NormalLayout.tsx`:

```tsx
import { useRef } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { useTerminal } from '@/contexts/TerminalContext';
import { TerminalBottomDrawer } from '@/components/layout/TerminalBottomDrawer';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const { isDrawerOpen } = useTerminal();

  const hasEverOpened = useRef(false);
  if (isDrawerOpen) {
    hasEverOpened.current = true;
  }

  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'normalLayout-terminal',
    storage: localStorage,
  });

  return (
    <div className="flex flex-col h-full">
      <DevBanner />
      <div className="flex-1 min-h-0">
        <Group
          orientation="vertical"
          className="h-full"
          defaultLayout={defaultLayout}
          onLayoutChange={onLayoutChange}
        >
          <Panel
            id="content"
            defaultSize={isDrawerOpen ? 70 : 100}
            minSize={30}
            className="min-h-0"
          >
            <div className="flex flex-col h-full">
              {!shouldHideNavbar && <Navbar />}
              <div className="flex-1 min-h-0 overflow-auto">
                <Outlet />
              </div>
            </div>
          </Panel>

          {hasEverOpened.current && (
            <>
              <Separator
                id="terminal-handle"
                className="h-1 bg-border cursor-row-resize hover:bg-accent transition-colors"
              />
              <Panel
                id="terminal"
                defaultSize={isDrawerOpen ? 30 : 0}
                minSize={isDrawerOpen ? 15 : 0}
                collapsible
                collapsedSize={0}
                className="min-h-0"
                style={{ display: isDrawerOpen ? undefined : 'none' }}
              >
                <TerminalBottomDrawer />
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && pnpm run check`

Expected: May show errors in `Navbar.tsx` which still references `useTerminalDrawer` — fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/TerminalBottomDrawer.tsx frontend/src/components/layout/NormalLayout.tsx
git commit -m "feat(terminal): add TerminalBottomDrawer and rewrite NormalLayout with resizable panels"
```

---

### Task 7: Update Navbar to use unified TerminalContext

**Files:**
- Modify: `frontend/src/components/layout/Navbar.tsx`

- [ ] **Step 1: Replace useTerminalDrawer with useTerminal**

In `frontend/src/components/layout/Navbar.tsx`:

Replace the import (line 46):

```typescript
// Before:
import { useTerminalDrawer } from '@/contexts/TerminalDrawerContext';

// After:
import { useTerminal } from '@/contexts/TerminalContext';
```

Replace the hook usage (around line 94):

```typescript
// Before:
const { isDrawerOpen, drawerWorkspaceId, closeDrawer, toggleDrawer } =
  useTerminalDrawer();

// After:
const { isDrawerOpen, toggleDrawer, createTab, getAllTabs } = useTerminal();
```

- [ ] **Step 2: Remove the project-terminal auto-close effect**

Delete the `useEffect` that closes the terminal when navigating away from a project (lines 99-106):

```typescript
// DELETE this entire useEffect:
useEffect(() => {
  if (!isDrawerOpen) return;
  if (!drawerWorkspaceId.startsWith('project-terminal:')) return;
  const drawerProjectId = drawerWorkspaceId.replace('project-terminal:', '');
  if (drawerProjectId !== projectId) {
    closeDrawer();
  }
}, [projectId, isDrawerOpen, drawerWorkspaceId, closeDrawer]);
```

- [ ] **Step 3: Update handleToggleTerminal for smart auto-open**

Replace `handleToggleTerminal` (around line 108):

```typescript
const handleToggleTerminal = useCallback(() => {
  if (isDrawerOpen) {
    toggleDrawer();
    return;
  }

  // Smart auto-open: create a tab in the best context if none exist
  const existingTabs = getAllTabs();
  if (existingTabs.length === 0) {
    if (projectId && repos?.length) {
      const repoPath = String(repos[0].path);
      createTab(
        `project-terminal:${projectId}`,
        `project-terminal:${projectId}`,
        repoPath,
        { type: 'project', projectId }
      );
    } else if (homeDirData?.home_dir) {
      createTab(
        'global-terminal',
        'global-terminal',
        homeDirData.home_dir,
        { type: 'home' }
      );
    }
  }

  toggleDrawer();
}, [isDrawerOpen, toggleDrawer, getAllTabs, createTab, projectId, repos, homeDirData]);
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && pnpm run check`

Expected: Clean build. All references to `TerminalDrawerContext` are now gone.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Navbar.tsx
git commit -m "feat(terminal): update Navbar to use unified TerminalContext"
```

---

### Task 8: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run type check**

Run: `cd frontend && pnpm run check`

Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `cd frontend && pnpm run lint`

Expected: No errors. Fix any lint issues.

- [ ] **Step 3: Grep for stale references**

Search for any remaining references to the deleted context:

```bash
grep -r "TerminalDrawerContext\|useTerminalDrawer\|TerminalDrawerProvider" frontend/src/
```

Expected: No matches.

Search for stale `'terminal'` in LayoutMode usage:

```bash
grep -rn "mode.*terminal\|terminal.*mode\|'terminal'" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "\.json"
```

Expected: Only references in i18n JSON files (which are fine to keep) and no TypeScript references.

- [ ] **Step 4: Manual smoke test**

Start the dev server:

```bash
pnpm run dev
```

Verify:
1. Navbar terminal button opens a bottom drawer (not a right drawer)
2. The drawer is resizable by dragging the separator
3. The "+" button shows a dropdown with context options (Task/Project/Home)
4. Closing and reopening the drawer preserves terminal state (xterm.js + WebSocket)
5. The AttemptHeaderActions no longer shows a terminal toggle button
6. The view cycle (Cmd+Enter) no longer includes terminal

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(terminal): cleanup stale references and lint issues"
```
