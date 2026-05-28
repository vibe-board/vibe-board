# Global Terminal Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one unified terminal drawer available from direct connection home, project lists, project pages, and task pages.

**Architecture:** Move terminal ownership from `NormalLayout` into a shell-level `TerminalHost`. Pages register available terminal targets; terminal tabs store connection identity so `XTermInstance` can bind to the right `UnifiedConnection` independently from the current page.

**Tech Stack:** React, TypeScript, Vite, TanStack Query, Zustand connection store, `react-resizable-panels`, existing xterm.js terminal components.

---

## File Structure

- Create `frontend/src/contexts/TerminalTargetContext.tsx`
  - Owns target registration and exposes current target list plus best-target selection.
- Create `frontend/src/components/layout/TerminalHost.tsx`
  - Owns the shell-level bottom drawer and renders `TerminalPanel`.
- Create `frontend/src/components/panels/TerminalConnectionFrame.tsx`
  - Resolves a terminal tab connection and wraps `XTermInstance` with `ConnectionProvider` and `QueryClientProvider`.
- Modify `frontend/src/contexts/TerminalContext.tsx`
  - Extend terminal tab context with connection identity and expose `createTabFromTarget`.
- Modify `frontend/src/components/panels/TerminalPanel.tsx`
  - Render tabs through `TerminalConnectionFrame` and create tabs from registered targets.
- Modify `frontend/src/components/layout/TerminalBottomDrawer.tsx`
  - Convert into a target registration component for route-specific terminal targets.
- Modify `frontend/src/components/layout/NormalLayout.tsx`
  - Remove drawer ownership and register task/project targets.
- Modify `frontend/src/App.tsx`
  - Remove nested `TerminalProvider`; keep app page providers unchanged.
- Modify `frontend/src/components/tabs/TabShell.tsx`
  - Add `TerminalProvider`, `TerminalTargetProvider`, and `TerminalHost` around shell content.
- Modify `frontend/src/components/tabs/LocalDirectShell.tsx`
  - Keep rendering `App`, relying on shell-level terminal provider.
- Modify `frontend/src/components/tabs/MultiConnectionShell.tsx`
  - Render content inside `TerminalHost` and keep top tab bar outside the resizable content panel.
- Modify `frontend/src/components/tabs/GatewayShell.tsx`
  - Same shell-level host integration as multi connection.
- Modify `frontend/src/components/tabs/TabBar.tsx`
  - Add terminal icon that toggles the global drawer.
- Modify `frontend/src/components/tabs/HomeTab.tsx`
  - Register direct connection home targets when a direct connection is active/clicked.
- Modify `frontend/src/components/tabs/MachineProjectsTab.tsx`
  - Register machine home target.
- Modify `frontend/src/components/tabs/ProjectTab.tsx`
  - Pass connection identity into app-level target registration.
- Modify `frontend/src/components/layout/Navbar.tsx`
  - Replace local target calculation with shared terminal action.
- Tests:
  - Create `frontend/src/contexts/__tests__/TerminalTargetContext.test.tsx`
  - Create `frontend/src/components/layout/__tests__/TerminalHost.test.tsx`
  - Update `frontend/src/components/layout/__tests__/NormalLayout.test.tsx`
  - Update `frontend/src/components/panels/__tests__/TerminalTabBar.test.tsx`

---

### Task 1: Add Terminal Target Registry

**Files:**
- Create: `frontend/src/contexts/TerminalTargetContext.tsx`
- Test: `frontend/src/contexts/__tests__/TerminalTargetContext.test.tsx`

- [ ] **Step 1: Write the failing target registry tests**

Create `frontend/src/contexts/__tests__/TerminalTargetContext.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import {
  TerminalTargetProvider,
  useTerminalTargets,
  type TerminalTarget,
} from '../TerminalTargetContext';

function wrapper({ children }: { children: ReactNode }) {
  return <TerminalTargetProvider>{children}</TerminalTargetProvider>;
}

const homeTarget: TerminalTarget = {
  id: 'home:conn-1',
  label: 'Connection Terminal',
  type: 'home',
  connectionId: 'conn-1',
  cwd: '/home/user',
};

const projectTarget: TerminalTarget = {
  id: 'project:conn-1:project-1',
  label: 'Project Terminal',
  type: 'project',
  connectionId: 'conn-1',
  projectId: 'project-1',
  cwd: '/repo/project',
};

const taskTarget: TerminalTarget = {
  id: 'task:conn-1:attempt-1',
  label: 'Task Terminal',
  type: 'task',
  connectionId: 'conn-1',
  workspaceId: 'attempt-1',
  attemptId: 'attempt-1',
  taskId: 'task-1',
  cwd: '/worktree/project',
};

describe('TerminalTargetContext', () => {
  it('registers and unregisters targets by scope', () => {
    const { result, unmount } = renderHook(() => useTerminalTargets(), {
      wrapper,
    });

    act(() => {
      result.current.registerTargets('scope-1', [homeTarget]);
      result.current.registerTargets('scope-2', [projectTarget]);
    });

    expect(result.current.targets.map((target) => target.id)).toEqual([
      'home:conn-1',
      'project:conn-1:project-1',
    ]);

    act(() => result.current.unregisterTargets('scope-1'));

    expect(result.current.targets.map((target) => target.id)).toEqual([
      'project:conn-1:project-1',
    ]);

    unmount();
  });

  it('chooses task before project before home as the best enabled target', () => {
    const { result } = renderHook(() => useTerminalTargets(), { wrapper });

    act(() => {
      result.current.registerTargets('scope', [
        homeTarget,
        projectTarget,
        taskTarget,
      ]);
    });

    expect(result.current.getBestTarget()?.id).toBe('task:conn-1:attempt-1');
  });

  it('ignores disabled targets when choosing the best target', () => {
    const { result } = renderHook(() => useTerminalTargets(), { wrapper });

    act(() => {
      result.current.registerTargets('scope', [
        { ...taskTarget, disabled: true, disabledReason: 'No workspace' },
        projectTarget,
        homeTarget,
      ]);
    });

    expect(result.current.getBestTarget()?.id).toBe(
      'project:conn-1:project-1'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend && pnpm exec vitest run src/contexts/__tests__/TerminalTargetContext.test.tsx
```

Expected: FAIL because `TerminalTargetContext` does not exist.

- [ ] **Step 3: Implement the target registry**

Create `frontend/src/contexts/TerminalTargetContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type TerminalTargetType = 'task' | 'project' | 'home';

export interface TerminalTarget {
  id: string;
  label: string;
  type: TerminalTargetType;
  connectionId?: string;
  machineId?: string;
  cwd: string;
  workspaceId?: string;
  attemptId?: string;
  taskId?: string;
  projectId?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface TerminalTargetContextValue {
  targets: TerminalTarget[];
  registerTargets: (scopeId: string, targets: TerminalTarget[]) => void;
  unregisterTargets: (scopeId: string) => void;
  getBestTarget: () => TerminalTarget | null;
}

const TerminalTargetContext =
  createContext<TerminalTargetContextValue | null>(null);

function targetRank(type: TerminalTargetType): number {
  if (type === 'task') return 0;
  if (type === 'project') return 1;
  return 2;
}

export function TerminalTargetProvider({ children }: { children: ReactNode }) {
  const [targetsByScope, setTargetsByScope] = useState<
    Record<string, TerminalTarget[]>
  >({});

  const registerTargets = useCallback(
    (scopeId: string, targets: TerminalTarget[]) => {
      setTargetsByScope((prev) => ({ ...prev, [scopeId]: targets }));
    },
    []
  );

  const unregisterTargets = useCallback((scopeId: string) => {
    setTargetsByScope((prev) => {
      const { [scopeId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const targets = useMemo(
    () => Object.values(targetsByScope).flat(),
    [targetsByScope]
  );

  const getBestTarget = useCallback(() => {
    return (
      targets
        .filter((target) => !target.disabled && target.cwd)
        .sort((a, b) => targetRank(a.type) - targetRank(b.type))[0] ?? null
    );
  }, [targets]);

  const value = useMemo(
    () => ({ targets, registerTargets, unregisterTargets, getBestTarget }),
    [targets, registerTargets, unregisterTargets, getBestTarget]
  );

  return (
    <TerminalTargetContext.Provider value={value}>
      {children}
    </TerminalTargetContext.Provider>
  );
}

export function useTerminalTargets() {
  const context = useContext(TerminalTargetContext);
  if (!context) {
    throw new Error(
      'useTerminalTargets must be used within TerminalTargetProvider'
    );
  }
  return context;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd frontend && pnpm exec vitest run src/contexts/__tests__/TerminalTargetContext.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/TerminalTargetContext.tsx frontend/src/contexts/__tests__/TerminalTargetContext.test.tsx
git commit -m "feat(terminal): add terminal target registry"
```

---

### Task 2: Extend Terminal Context For Target-Based Tabs

**Files:**
- Modify: `frontend/src/contexts/TerminalContext.tsx`
- Test: `frontend/src/contexts/__tests__/TerminalContext.test.tsx`

- [ ] **Step 1: Write failing tests for target-based tab creation and sanitization**

Create `frontend/src/contexts/__tests__/TerminalContext.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import {
  TerminalProvider,
  useTerminal,
} from '../TerminalContext';
import type { TerminalTarget } from '../TerminalTargetContext';

function wrapper({ children }: { children: ReactNode }) {
  return <TerminalProvider>{children}</TerminalProvider>;
}

const projectTarget: TerminalTarget = {
  id: 'project:conn-1:project-1',
  label: 'Project Terminal',
  type: 'project',
  connectionId: 'conn-1',
  machineId: 'machine-1',
  projectId: 'project-1',
  cwd: '/repo/project',
};

describe('TerminalContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates terminal tabs from terminal targets', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    act(() => result.current.createTabFromTarget(projectTarget));

    const tab = result.current.getActiveGlobalTab();
    expect(tab?.cwd).toBe('/repo/project');
    expect(tab?.workspaceId).toBe('project-terminal:conn-1:project-1');
    expect(tab?.context).toEqual({
      type: 'project',
      connectionId: 'conn-1',
      machineId: 'machine-1',
      projectId: 'project-1',
    });
  });

  it('preserves persisted tabs with connection identity', () => {
    localStorage.setItem(
      'vibe-board:terminal-sessions',
      JSON.stringify({
        tabsByWorkspace: {
          'project-terminal:conn-1:project-1': [
            {
              id: 'term-1',
              title: 'Terminal 1',
              workspaceId: 'project-terminal:conn-1:project-1',
              taskId: 'project-terminal:conn-1:project-1',
              cwd: '/repo/project',
              sessionId: null,
              context: {
                type: 'project',
                connectionId: 'conn-1',
                machineId: 'machine-1',
                projectId: 'project-1',
              },
            },
          ],
        },
        activeTabByWorkspace: {
          'project-terminal:conn-1:project-1': 'term-1',
        },
        closedWorkspaces: [],
        tabCounterByWorkspace: {
          'project-terminal:conn-1:project-1': 1,
        },
        globalActiveTabId: 'term-1',
      })
    );

    const { result } = renderHook(() => useTerminal(), { wrapper });

    expect(result.current.getAllTabs()).toHaveLength(1);
    expect(result.current.getActiveGlobalTab()?.context).toMatchObject({
      type: 'project',
      connectionId: 'conn-1',
      machineId: 'machine-1',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend && pnpm exec vitest run src/contexts/__tests__/TerminalContext.test.tsx
```

Expected: FAIL because `createTabFromTarget` and extended context fields do not exist.

- [ ] **Step 3: Update terminal context types and creation helper**

In `frontend/src/contexts/TerminalContext.tsx`, import the target type:

```ts
import type { TerminalTarget } from '@/contexts/TerminalTargetContext';
```

Replace `TerminalTabContext` with:

```ts
export type TerminalTabContext =
  | {
      type: 'task';
      connectionId?: string;
      machineId?: string;
      workspaceId: string;
      attemptId: string;
      taskId: string;
    }
  | {
      type: 'project';
      connectionId?: string;
      machineId?: string;
      projectId: string;
    }
  | {
      type: 'home';
      connectionId?: string;
      machineId?: string;
    };
```

Add helpers near `generateTabId()`:

```ts
function buildWorkspaceIdForTarget(target: TerminalTarget): string {
  if (target.type === 'task') {
    return target.workspaceId ?? target.attemptId ?? target.id;
  }
  if (target.type === 'project') {
    const connectionPart = target.connectionId ?? 'local';
    return `project-terminal:${connectionPart}:${target.projectId ?? target.id}`;
  }
  const connectionPart = target.connectionId ?? 'local';
  const machinePart = target.machineId ? `:${target.machineId}` : '';
  return `home-terminal:${connectionPart}${machinePart}`;
}

function buildTaskIdForTarget(target: TerminalTarget, workspaceId: string) {
  return target.taskId ?? workspaceId;
}

function buildContextForTarget(target: TerminalTarget): TerminalTabContext {
  if (target.type === 'task') {
    return {
      type: 'task',
      connectionId: target.connectionId,
      machineId: target.machineId,
      workspaceId: target.workspaceId ?? target.attemptId ?? target.id,
      attemptId: target.attemptId ?? target.workspaceId ?? target.id,
      taskId: target.taskId ?? target.id,
    };
  }
  if (target.type === 'project') {
    return {
      type: 'project',
      connectionId: target.connectionId,
      machineId: target.machineId,
      projectId: target.projectId ?? target.id,
    };
  }
  return {
    type: 'home',
    connectionId: target.connectionId,
    machineId: target.machineId,
  };
}
```

Extend `TerminalContextType` with:

```ts
  createTabFromTarget: (target: TerminalTarget) => void;
```

Add the callback inside `TerminalProvider`:

```ts
  const createTabFromTarget = useCallback((target: TerminalTarget) => {
    const workspaceId = buildWorkspaceIdForTarget(target);
    dispatch({
      type: 'CREATE_TAB',
      workspaceId,
      taskId: buildTaskIdForTarget(target, workspaceId),
      cwd: target.cwd,
      context: buildContextForTarget(target),
    });
  }, []);
```

Include `createTabFromTarget` in the context value and memo dependency array.

- [ ] **Step 4: Update persisted tab validation**

In `isValidTab`, keep the existing base checks and replace the context validation with:

```ts
  const ctx = tab.context as Record<string, unknown> | undefined;
  if (!ctx) return false;
  if (ctx.type === 'task') {
    return (
      typeof ctx.attemptId === 'string' &&
      typeof ctx.taskId === 'string' &&
      (ctx.workspaceId === undefined || typeof ctx.workspaceId === 'string') &&
      (ctx.connectionId === undefined ||
        typeof ctx.connectionId === 'string') &&
      (ctx.machineId === undefined || typeof ctx.machineId === 'string')
    );
  }
  if (ctx.type === 'project') {
    return (
      typeof ctx.projectId === 'string' &&
      (ctx.connectionId === undefined ||
        typeof ctx.connectionId === 'string') &&
      (ctx.machineId === undefined || typeof ctx.machineId === 'string')
    );
  }
  if (ctx.type === 'home') {
    return (
      (ctx.connectionId === undefined ||
        typeof ctx.connectionId === 'string') &&
      (ctx.machineId === undefined || typeof ctx.machineId === 'string')
    );
  }
  return false;
```

- [ ] **Step 5: Update existing callers to satisfy new task context**

In `frontend/src/components/layout/TerminalBottomDrawer.tsx`, update task context creation from:

```ts
context: {
  type: 'task',
  attemptId: attempt?.id ?? '',
  taskId: taskId ?? '',
},
```

to:

```ts
context: {
  type: 'task',
  workspaceId: attempt?.id ?? '',
  attemptId: attempt?.id ?? '',
  taskId: taskId ?? '',
},
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
cd frontend && pnpm exec vitest run src/contexts/__tests__/TerminalContext.test.tsx
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/contexts/TerminalContext.tsx frontend/src/contexts/__tests__/TerminalContext.test.tsx frontend/src/components/layout/TerminalBottomDrawer.tsx
git commit -m "feat(terminal): create tabs from terminal targets"
```

---

### Task 3: Add Connection-Bound Terminal Frame

**Files:**
- Create: `frontend/src/components/panels/TerminalConnectionFrame.tsx`
- Modify: `frontend/src/components/panels/TerminalPanel.tsx`
- Test: `frontend/src/components/panels/__tests__/TerminalConnectionFrame.test.tsx`

- [ ] **Step 1: Write failing tests for missing connection display**

Create `frontend/src/components/panels/__tests__/TerminalConnectionFrame.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TerminalTab } from '@/contexts/TerminalContext';

import { TerminalConnectionFrame } from '../TerminalConnectionFrame';

vi.mock('@/stores/connection-store', () => ({
  useConnectionStore: (selector: (state: unknown) => unknown) =>
    selector({
      getConnection: () => null,
    }),
}));

vi.mock('@/lib/appMode', () => ({
  isLocalDirect: false,
}));

vi.mock('@/lib/connections/localConnection', () => ({
  LocalConnection: {
    getInstance: vi.fn(),
  },
}));

const tab: TerminalTab = {
  id: 'term-1',
  title: 'Terminal 1',
  workspaceId: 'home-terminal:missing',
  taskId: 'home-terminal:missing',
  cwd: '/home/user',
  sessionId: null,
  context: {
    type: 'home',
    connectionId: 'missing',
  },
};

describe('TerminalConnectionFrame', () => {
  it('shows a recoverable message when the connection is missing', () => {
    render(
      <TerminalConnectionFrame
        tab={tab}
        endpointUrl="/api/terminal/direct-ws?cwd=%2Fhome%2Fuser"
        isActive
        onClose={vi.fn()}
        onSessionId={vi.fn()}
        registerInstance={vi.fn()}
      />
    );

    expect(screen.getByText('Connection removed')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/panels/__tests__/TerminalConnectionFrame.test.tsx
```

Expected: FAIL because `TerminalConnectionFrame` does not exist.

- [ ] **Step 3: Implement `TerminalConnectionFrame`**

Create `frontend/src/components/panels/TerminalConnectionFrame.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import type { TerminalTab } from '@/contexts/TerminalContext';
import { isLocalDirect } from '@/lib/appMode';
import { LocalConnection } from '@/lib/connections/localConnection';
import { useConnectionStore } from '@/stores/connection-store';
import { XTermInstance, type XTermInstanceHandle } from './XTermInstance';

interface TerminalConnectionFrameProps {
  tab: TerminalTab;
  endpointUrl: string;
  isActive: boolean;
  onClose: () => void;
  onSessionId: (sessionId: string | null) => void;
  registerInstance: (handle: XTermInstanceHandle | null) => void;
}

export function TerminalConnectionFrame({
  tab,
  endpointUrl,
  isActive,
  onClose,
  onSessionId,
  registerInstance,
}: TerminalConnectionFrameProps) {
  const getConnection = useConnectionStore((s) => s.getConnection);
  const connectionId = tab.context.connectionId;
  const machineId = tab.context.machineId;
  const connection = connectionId
    ? getConnection(connectionId, machineId)
    : isLocalDirect
      ? LocalConnection.getInstance()
      : null;

  if (!connection) {
    return (
      <div className={isActive ? 'h-full' : 'hidden'}>
        <div className="flex h-full items-center justify-center bg-secondary text-sm text-low">
          Connection removed
        </div>
      </div>
    );
  }

  if (connection.status !== 'connected') {
    return (
      <div className={isActive ? 'h-full' : 'hidden'}>
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-secondary text-sm text-low">
          <div>{connection.error || 'Connection is not connected'}</div>
          <button
            className="rounded border border-border px-3 py-1 text-normal hover:bg-primary/50"
            onClick={() => connection.connect().catch(() => {})}
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <ConnectionProvider connection={connection}>
      <QueryClientProvider client={connection.queryClient}>
        <XTermInstance
          ref={registerInstance}
          endpointUrl={endpointUrl}
          isActive={isActive}
          onClose={onClose}
          sessionId={tab.sessionId}
          onSessionId={onSessionId}
        />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 4: Update `TerminalPanel` to use the frame**

In `frontend/src/components/panels/TerminalPanel.tsx`, import the frame:

```ts
import { TerminalConnectionFrame } from './TerminalConnectionFrame';
import type { TerminalTarget } from '@/contexts/TerminalTargetContext';
```

Change `NewTabOption` to extend the target model:

```ts
export type NewTabOption = TerminalTarget;
```

Update the `useTerminal()` destructuring:

```ts
    createTabFromTarget,
```

Change `handleNewTab`:

```ts
  const handleNewTab = (option: NewTabOption) => {
    createTabFromTarget(option);
  };
```

Replace the `<XTermInstance ... />` block with:

```tsx
            <TerminalConnectionFrame
              key={tab.id}
              tab={tab}
              endpointUrl={endpointUrl}
              isActive={tab.id === activeTab?.id}
              onClose={() => closeTab(tab.workspaceId, tab.id)}
              onSessionId={(sid) => setSessionId(tab.workspaceId, tab.id, sid)}
              registerInstance={(handle) => {
                if (handle) {
                  instanceRefs.current.set(tab.id, handle);
                } else {
                  instanceRefs.current.delete(tab.id);
                }
              }}
            />
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/panels/__tests__/TerminalConnectionFrame.test.tsx src/components/panels/__tests__/TerminalTabBar.test.tsx
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/panels/TerminalConnectionFrame.tsx frontend/src/components/panels/TerminalPanel.tsx frontend/src/components/panels/__tests__/TerminalConnectionFrame.test.tsx
git commit -m "feat(terminal): bind terminal tabs to saved connections"
```

---

### Task 4: Add Shell-Level Terminal Host

**Files:**
- Create: `frontend/src/components/layout/TerminalHost.tsx`
- Test: `frontend/src/components/layout/__tests__/TerminalHost.test.tsx`

- [ ] **Step 1: Write failing host collapse/resize tests**

Create `frontend/src/components/layout/__tests__/TerminalHost.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TerminalHost } from '../TerminalHost';

const mocks = vi.hoisted(() => ({
  isDrawerOpen: false,
  collapseTerminalPanel: vi.fn(),
  resizeTerminalPanel: vi.fn(),
}));

vi.mock('@/contexts/TerminalContext', () => ({
  useTerminal: () => ({ isDrawerOpen: mocks.isDrawerOpen }),
}));

vi.mock('@/contexts/TerminalTargetContext', () => ({
  useTerminalTargets: () => ({ targets: [] }),
}));

vi.mock('@/components/panels/TerminalPanel', () => ({
  TerminalPanel: () => <div data-testid="terminal-panel" />,
}));

vi.mock('react-resizable-panels', () => {
  const Panel = React.forwardRef<
    { collapse: () => void; resize: (size: number) => void },
    React.PropsWithChildren<{
      id?: string;
      panelRef?: React.Ref<{
        collapse: () => void;
        resize: (size: number) => void;
      }>;
    }>
  >(function MockPanel({ children, id, panelRef }, _ref) {
    React.useImperativeHandle(panelRef, () => ({
      collapse: id === 'terminal' ? mocks.collapseTerminalPanel : vi.fn(),
      resize: id === 'terminal' ? mocks.resizeTerminalPanel : vi.fn(),
    }));

    return <div data-testid={`panel-${id}`}>{children}</div>;
  });

  return {
    Group: ({ children }: React.PropsWithChildren) => (
      <div data-testid="panel-group">{children}</div>
    ),
    Panel,
    Separator: ({ children }: React.PropsWithChildren) => (
      <div data-testid="separator">{children}</div>
    ),
    useDefaultLayout: () => ({
      defaultLayout: undefined,
      onLayoutChange: vi.fn(),
    }),
  };
});

describe('TerminalHost', () => {
  it('resizes the terminal panel when opened', async () => {
    mocks.isDrawerOpen = true;
    render(
      <TerminalHost>
        <div data-testid="content" />
      </TerminalHost>
    );

    await waitFor(() => {
      expect(mocks.resizeTerminalPanel).toHaveBeenCalledWith(30);
    });
  });

  it('collapses the terminal panel when closed', async () => {
    mocks.isDrawerOpen = false;
    render(
      <TerminalHost>
        <div data-testid="content" />
      </TerminalHost>
    );

    await waitFor(() => {
      expect(mocks.collapseTerminalPanel).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/layout/__tests__/TerminalHost.test.tsx
```

Expected: FAIL because `TerminalHost` does not exist.

- [ ] **Step 3: Implement `TerminalHost`**

Create `frontend/src/components/layout/TerminalHost.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type PanelImperativeHandle,
} from 'react-resizable-panels';
import { useTerminal } from '@/contexts/TerminalContext';
import { useTerminalTargets } from '@/contexts/TerminalTargetContext';
import { TerminalPanel } from '@/components/panels/TerminalPanel';

export function TerminalHost({ children }: { children: ReactNode }) {
  const { isDrawerOpen } = useTerminal();
  const { targets } = useTerminalTargets();
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    const terminalPanel = terminalPanelRef.current;
    if (!terminalPanel) return;

    const frameId = requestAnimationFrame(() => {
      if (isDrawerOpen) {
        terminalPanel.resize(30);
      } else {
        terminalPanel.collapse();
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [isDrawerOpen]);

  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'global-terminal-host',
    storage: localStorage,
  });

  return (
    <Group
      orientation="vertical"
      className="h-full min-h-0"
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
    >
      <Panel
        id="content"
        defaultSize={isDrawerOpen ? 70 : 100}
        minSize={30}
        className="min-h-0"
      >
        {children}
      </Panel>

      <Separator
        id="terminal-handle"
        className="h-1 bg-border cursor-row-resize hover:bg-accent transition-colors"
      />
      <Panel
        id="terminal"
        panelRef={terminalPanelRef}
        defaultSize={isDrawerOpen ? 30 : 0}
        minSize={15}
        collapsible
        collapsedSize={0}
        className="min-h-0"
      >
        <TerminalPanel newTabOptions={targets} />
      </Panel>
    </Group>
  );
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/layout/__tests__/TerminalHost.test.tsx
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/TerminalHost.tsx frontend/src/components/layout/__tests__/TerminalHost.test.tsx
git commit -m "feat(terminal): add shell-level terminal host"
```

---

### Task 5: Wire Providers And Remove NormalLayout Drawer Ownership

**Files:**
- Modify: `frontend/src/components/tabs/TabShell.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/NormalLayout.tsx`
- Test: `frontend/src/components/layout/__tests__/NormalLayout.test.tsx`

- [ ] **Step 1: Update `NormalLayout` test to assert drawer removal**

Replace `frontend/src/components/layout/__tests__/NormalLayout.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NormalLayout } from '../NormalLayout';

vi.mock('@/components/DevBanner', () => ({
  DevBanner: () => <div data-testid="dev-banner" />,
}));

vi.mock('@/components/layout/Navbar', () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

describe('NormalLayout', () => {
  it('renders page content without owning the terminal drawer', () => {
    render(<NormalLayout />);

    expect(screen.getByTestId('dev-banner')).toBeInTheDocument();
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-drawer')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/layout/__tests__/NormalLayout.test.tsx
```

Expected: FAIL because `NormalLayout` still renders the terminal drawer or test imports no longer match current implementation.

- [ ] **Step 3: Move terminal providers to `TabShell`**

Update `frontend/src/components/tabs/TabShell.tsx`:

```tsx
// frontend/src/components/tabs/TabShell.tsx
import { isLocalDirect, isGateway } from '@/lib/appMode';
import { TerminalProvider } from '@/contexts/TerminalContext';
import { TerminalTargetProvider } from '@/contexts/TerminalTargetContext';
import { LocalDirectShell } from './LocalDirectShell';
import { GatewayShell } from './GatewayShell';
import { MultiConnectionShell } from './MultiConnectionShell';

function ShellByMode() {
  if (isLocalDirect) return <LocalDirectShell />;
  if (isGateway) return <GatewayShell />;
  return <MultiConnectionShell />;
}

export function TabShell() {
  return (
    <TerminalProvider>
      <TerminalTargetProvider>
        <ShellByMode />
      </TerminalTargetProvider>
    </TerminalProvider>
  );
}
```

- [ ] **Step 4: Remove nested terminal provider from `App`**

In `frontend/src/App.tsx`, remove:

```ts
import { TerminalProvider } from '@/contexts/TerminalContext';
```

Replace:

```tsx
        <SearchProvider>
          <TerminalProvider>
            <SentryRoutes>
              ...
            </SentryRoutes>
          </TerminalProvider>
        </SearchProvider>
```

with:

```tsx
        <SearchProvider>
          <SentryRoutes>
            ...
          </SentryRoutes>
        </SearchProvider>
```

- [ ] **Step 5: Simplify `NormalLayout`**

In `frontend/src/components/layout/NormalLayout.tsx`, remove imports from
`react`, `react-resizable-panels`, `useTerminal`, and `TerminalBottomDrawer`.

Replace the component body with:

```tsx
export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';

  return (
    <div className="flex flex-col h-full">
      <DevBanner />
      <div className="flex-1 min-h-0">
        <div className="flex flex-col h-full">
          {!shouldHideNavbar && <Navbar />}
          <div className="flex-1 min-h-0 overflow-auto">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/layout/__tests__/NormalLayout.test.tsx
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/tabs/TabShell.tsx frontend/src/App.tsx frontend/src/components/layout/NormalLayout.tsx frontend/src/components/layout/__tests__/NormalLayout.test.tsx
git commit -m "refactor(terminal): move terminal provider to shell"
```

---

### Task 6: Wrap Shell Content In TerminalHost

**Files:**
- Modify: `frontend/src/components/tabs/LocalDirectShell.tsx`
- Modify: `frontend/src/components/tabs/MultiConnectionShell.tsx`
- Modify: `frontend/src/components/tabs/GatewayShell.tsx`

- [ ] **Step 1: Write failing smoke tests for shell host rendering**

Create `frontend/src/components/tabs/__tests__/MultiConnectionShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MultiConnectionShell } from '../MultiConnectionShell';

vi.mock('@/stores/connection-store', () => ({
  useConnectionStore: () => ({
    initialized: true,
    init: vi.fn(),
    tabs: [],
    activeTabId: 'home',
    closeTab: vi.fn(),
    setActiveTab: vi.fn(),
  }),
}));

vi.mock('../TabBar', () => ({
  TabBar: () => <div data-testid="tab-bar" />,
}));

vi.mock('../HomeTab', () => ({
  HomeTab: () => <div data-testid="home-tab" />,
}));

vi.mock('@/components/layout/TerminalHost', () => ({
  TerminalHost: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="terminal-host">{children}</div>
  ),
}));

describe('MultiConnectionShell', () => {
  it('renders tab content inside the terminal host', () => {
    render(<MultiConnectionShell />);

    expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-host')).toContainElement(
      screen.getByTestId('home-tab')
    );
  });
});
```

- [ ] **Step 2: Run smoke test to verify it fails**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/tabs/__tests__/MultiConnectionShell.test.tsx
```

Expected: FAIL because `MultiConnectionShell` does not use `TerminalHost`.

- [ ] **Step 3: Wrap local direct content**

In `frontend/src/components/tabs/LocalDirectShell.tsx`, import:

```ts
import { TerminalHost } from '@/components/layout/TerminalHost';
```

Replace the connected return with:

```tsx
  return (
    <div className="h-screen">
      <TerminalHost>
        <App />
      </TerminalHost>
    </div>
  );
```

- [ ] **Step 4: Wrap multi-connection content**

In `frontend/src/components/tabs/MultiConnectionShell.tsx`, import:

```ts
import { TerminalHost } from '@/components/layout/TerminalHost';
```

Replace the final return with:

```tsx
  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar />
      <div className="flex-1 min-h-0 overflow-hidden">
        <TerminalHost>
          <div className="h-full overflow-hidden">
            <div
              className={`h-full overflow-auto ${
                activeTabId === 'home' ? '' : 'hidden'
              }`}
            >
              <HomeTab />
            </div>

            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`h-full overflow-hidden ${
                  activeTabId === tab.id ? '' : 'hidden'
                }`}
              >
                {tab.type === 'machine-projects' ? (
                  <MachineProjectsTab tab={tab} />
                ) : (
                  <ProjectTab tab={tab} />
                )}
              </div>
            ))}
          </div>
        </TerminalHost>
      </div>
    </div>
  );
```

- [ ] **Step 5: Wrap gateway content**

In `frontend/src/components/tabs/GatewayShell.tsx`, import:

```ts
import { TerminalHost } from '@/components/layout/TerminalHost';
```

Wrap the content area in the same pattern as `MultiConnectionShell`, keeping
`GatewayHomeTab`, `MachineProjectsTab`, and `ProjectTab` unchanged inside the
inner `div`.

- [ ] **Step 6: Run smoke test and typecheck**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/tabs/__tests__/MultiConnectionShell.test.tsx
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/tabs/LocalDirectShell.tsx frontend/src/components/tabs/MultiConnectionShell.tsx frontend/src/components/tabs/GatewayShell.tsx frontend/src/components/tabs/__tests__/MultiConnectionShell.test.tsx
git commit -m "feat(terminal): render terminal host in shell content"
```

---

### Task 7: Register Targets From Pages And Connections

**Files:**
- Modify: `frontend/src/components/layout/TerminalBottomDrawer.tsx`
- Modify: `frontend/src/components/layout/Navbar.tsx`
- Modify: `frontend/src/components/tabs/HomeTab.tsx`
- Modify: `frontend/src/components/tabs/MachineProjectsTab.tsx`
- Modify: `frontend/src/components/tabs/ProjectTab.tsx`
- Modify: `frontend/src/components/layout/NormalLayout.tsx`

- [ ] **Step 1: Create a reusable registration hook**

Append to `frontend/src/contexts/TerminalTargetContext.tsx`:

```tsx
import { useEffect } from 'react';
```

Add this export:

```tsx
export function useRegisterTerminalTargets(
  scopeId: string,
  targets: TerminalTarget[]
) {
  const { registerTargets, unregisterTargets } = useTerminalTargets();

  useEffect(() => {
    registerTargets(scopeId, targets);
    return () => unregisterTargets(scopeId);
  }, [scopeId, targets, registerTargets, unregisterTargets]);
}
```

If this creates duplicate imports, merge `useEffect` into the existing React
import list.

- [ ] **Step 2: Register direct connection home targets in `HomeTab`**

In `frontend/src/components/tabs/HomeTab.tsx`, import:

```ts
import { useHomeDir } from '@/hooks/useHomeDir';
import { useRegisterTerminalTargets } from '@/contexts/TerminalTargetContext';
```

Inside `DirectNodeView`, add:

```tsx
  const { data: homeDirData } = useHomeDir();
  useRegisterTerminalTargets(`direct-home:${node.entry.id}`, [
    {
      id: `home:${node.entry.id}`,
      label: `${node.entry.label || node.entry.url} Terminal`,
      type: 'home',
      connectionId: node.entry.id,
      cwd: homeDirData?.home_dir ?? '',
      disabled: !homeDirData?.home_dir,
      disabledReason: 'Home directory is not available',
    },
  ]);
```

- [ ] **Step 3: Register machine home target in `MachineProjectsTab`**

In `frontend/src/components/tabs/MachineProjectsTab.tsx`, import:

```ts
import { useMemo } from 'react';
import { useHomeDir } from '@/hooks/useHomeDir';
import { useRegisterTerminalTargets } from '@/contexts/TerminalTargetContext';
```

If `useEffect` and `useState` are already imported from React, merge
`useMemo` into that import.

After `conn` is resolved, add:

```tsx
  const { data: homeDirData } = useHomeDir();
  const targets = useMemo(
    () => [
      {
        id: `home:${tab.connectionId}:${tab.machineId ?? 'direct'}`,
        label: `${tab.label} Terminal`,
        type: 'home' as const,
        connectionId: tab.connectionId,
        machineId: tab.machineId,
        cwd: homeDirData?.home_dir ?? '',
        disabled: !homeDirData?.home_dir,
        disabledReason: 'Home directory is not available',
      },
    ],
    [tab.connectionId, tab.machineId, tab.label, homeDirData?.home_dir]
  );
  useRegisterTerminalTargets(`machine-projects:${tab.id}`, targets);
```

- [ ] **Step 4: Register project target in `ProjectTab`**

In `frontend/src/components/tabs/ProjectTab.tsx`, import:

```ts
import { useMemo } from 'react';
import { useProjectRepos } from '@/hooks';
import { useRegisterTerminalTargets } from '@/contexts/TerminalTargetContext';
```

Merge `useMemo` into the existing React import.

After `conn` is resolved, add:

```tsx
  const { data: repos } = useProjectRepos(tab.projectId);
  const projectTargets = useMemo(
    () => [
      {
        id: `project:${tab.connectionId}:${tab.machineId ?? 'direct'}:${tab.projectId}`,
        label: 'Project Terminal',
        type: 'project' as const,
        connectionId: tab.connectionId,
        machineId: tab.machineId,
        projectId: tab.projectId,
        cwd: repos?.[0]?.path ? String(repos[0].path) : '',
        disabled: !repos?.[0]?.path,
        disabledReason: 'Project repository is not available',
      },
    ],
    [tab.connectionId, tab.machineId, tab.projectId, repos]
  );
  useRegisterTerminalTargets(`project:${tab.id}`, projectTargets);
```

- [ ] **Step 5: Convert `TerminalBottomDrawer` into route target registrar**

Replace `frontend/src/components/layout/TerminalBottomDrawer.tsx` with a
registrar component:

```tsx
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks';
import { useHomeDir } from '@/hooks/useHomeDir';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useOptionalConnection } from '@/contexts/ConnectionContext';
import { useRegisterTerminalTargets } from '@/contexts/TerminalTargetContext';

export function TerminalBottomDrawer() {
  const { taskId, attemptId } = useParams<{
    projectId?: string;
    taskId?: string;
    attemptId?: string;
  }>();
  const connection = useOptionalConnection();
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

  const targets = useMemo(() => {
    const connectionId = connection?.id;
    const options = [];

    options.push({
      id: `task:${connectionId ?? 'local'}:${attempt?.id ?? 'none'}`,
      label: 'Task Terminal',
      type: 'task' as const,
      connectionId,
      workspaceId: attempt?.id ?? '',
      attemptId: attempt?.id ?? '',
      taskId: taskId ?? '',
      cwd: terminalCwd ?? '',
      disabled: !(attempt?.id && taskId && terminalCwd),
      disabledReason: 'Task workspace is not available',
    });

    const repoPath = repos?.[0]?.path ? String(repos[0].path) : '';
    options.push({
      id: `project:${connectionId ?? 'local'}:${projectId ?? 'none'}`,
      label: 'Project Terminal',
      type: 'project' as const,
      connectionId,
      projectId: projectId ?? '',
      cwd: repoPath,
      disabled: !projectId || !repoPath,
      disabledReason: 'Project repository is not available',
    });

    options.push({
      id: `home:${connectionId ?? 'local'}`,
      label: 'Home Directory',
      type: 'home' as const,
      connectionId,
      cwd: homeDirData?.home_dir ?? '',
      disabled: !homeDirData?.home_dir,
      disabledReason: 'Home directory is not available',
    });

    return options;
  }, [
    attempt?.id,
    taskId,
    terminalCwd,
    projectId,
    repos,
    homeDirData,
    connection?.id,
  ]);

  useRegisterTerminalTargets('normal-layout-route', targets);
  return null;
}
```

- [ ] **Step 6: Mount route target registrar in `NormalLayout`**

In `frontend/src/components/layout/NormalLayout.tsx`, import:

```ts
import { TerminalBottomDrawer } from '@/components/layout/TerminalBottomDrawer';
```

Render it once inside the root div:

```tsx
      <TerminalBottomDrawer />
```

Place it after `<DevBanner />` so it can register targets without affecting
layout.

- [ ] **Step 7: Replace Navbar terminal logic with target registry**

In `frontend/src/components/layout/Navbar.tsx`, remove `useProjectRepos`,
`useHomeDir`, `createTab`, and `getAllTabs` terminal-target calculations from
the component. Import:

```ts
import { useTerminalTargets } from '@/contexts/TerminalTargetContext';
```

Use:

```tsx
  const { isDrawerOpen, openDrawer, closeDrawer, createTabFromTarget, getAllTabs } =
    useTerminal();
  const { getBestTarget, targets } = useTerminalTargets();
```

Replace `handleToggleTerminal` with:

```tsx
  const handleToggleTerminal = useCallback(() => {
    if (isDrawerOpen) {
      closeDrawer();
      return;
    }

    if (getAllTabs().length === 0) {
      const target = getBestTarget();
      if (target) {
        createTabFromTarget(target);
      }
    }

    openDrawer();
  }, [
    isDrawerOpen,
    closeDrawer,
    getAllTabs,
    getBestTarget,
    createTabFromTarget,
    openDrawer,
  ]);
```

Change the terminal button disabled prop to:

```tsx
                disabled={targets.every((target) => target.disabled)}
```

- [ ] **Step 8: Run typecheck**

Run:

```bash
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/contexts/TerminalTargetContext.tsx frontend/src/components/layout/TerminalBottomDrawer.tsx frontend/src/components/layout/NormalLayout.tsx frontend/src/components/layout/Navbar.tsx frontend/src/components/tabs/HomeTab.tsx frontend/src/components/tabs/MachineProjectsTab.tsx frontend/src/components/tabs/ProjectTab.tsx
git commit -m "feat(terminal): register terminal targets from active UI"
```

---

### Task 8: Add Terminal Toggle To Connection Tab Bar

**Files:**
- Modify: `frontend/src/components/tabs/TabBar.tsx`
- Test: `frontend/src/components/tabs/__tests__/TabBar.test.tsx`

- [ ] **Step 1: Write failing tab bar terminal toggle test**

Create `frontend/src/components/tabs/__tests__/TabBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TabBar } from '../TabBar';

const mocks = vi.hoisted(() => ({
  openDrawer: vi.fn(),
  closeDrawer: vi.fn(),
  createTabFromTarget: vi.fn(),
  getAllTabs: vi.fn(() => []),
  getBestTarget: vi.fn(() => ({
    id: 'home:conn-1',
    label: 'Connection Terminal',
    type: 'home',
    connectionId: 'conn-1',
    cwd: '/home/user',
  })),
  isDrawerOpen: false,
}));

vi.mock('@/stores/connection-store', () => ({
  useConnectionStore: () => ({
    tabs: [],
    activeTabId: 'home',
    setActiveTab: vi.fn(),
    closeTab: vi.fn(),
  }),
}));

vi.mock('@/contexts/TerminalContext', () => ({
  useTerminal: () => ({
    isDrawerOpen: mocks.isDrawerOpen,
    openDrawer: mocks.openDrawer,
    closeDrawer: mocks.closeDrawer,
    createTabFromTarget: mocks.createTabFromTarget,
    getAllTabs: mocks.getAllTabs,
  }),
}));

vi.mock('@/contexts/TerminalTargetContext', () => ({
  useTerminalTargets: () => ({
    getBestTarget: mocks.getBestTarget,
    targets: [mocks.getBestTarget()],
  }),
}));

describe('TabBar', () => {
  it('creates the best terminal target and opens the drawer', () => {
    render(<TabBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle terminal' }));

    expect(mocks.createTabFromTarget).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'home:conn-1' })
    );
    expect(mocks.openDrawer).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/tabs/__tests__/TabBar.test.tsx
```

Expected: FAIL because `TabBar` has no terminal button.

- [ ] **Step 3: Add terminal button**

In `frontend/src/components/tabs/TabBar.tsx`, import:

```ts
import { X, Home, Plus, Monitor, SquareTerminal } from 'lucide-react';
import { useTerminal } from '@/contexts/TerminalContext';
import { useTerminalTargets } from '@/contexts/TerminalTargetContext';
```

Inside `TabBar`, add:

```tsx
  const {
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    createTabFromTarget,
    getAllTabs,
  } = useTerminal();
  const { getBestTarget, targets } = useTerminalTargets();

  const handleToggleTerminal = useCallback(() => {
    if (isDrawerOpen) {
      closeDrawer();
      return;
    }

    if (getAllTabs().length === 0) {
      const target = getBestTarget();
      if (target) createTabFromTarget(target);
    }

    openDrawer();
  }, [
    isDrawerOpen,
    closeDrawer,
    getAllTabs,
    getBestTarget,
    createTabFromTarget,
    openDrawer,
  ]);
```

Add this button before the add button:

```tsx
      <button
        className={`flex items-center justify-center px-3 py-2 transition-colors shrink-0 ${
          isDrawerOpen
            ? 'text-foreground bg-background/70'
            : 'text-foreground/40 hover:text-foreground/70'
        }`}
        onClick={handleToggleTerminal}
        disabled={targets.every((target) => target.disabled)}
        aria-label="Toggle terminal"
        title="Toggle terminal"
      >
        <SquareTerminal size={16} />
      </button>
```

- [ ] **Step 4: Run test and typecheck**

Run:

```bash
cd frontend && pnpm exec vitest run src/components/tabs/__tests__/TabBar.test.tsx
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tabs/TabBar.tsx frontend/src/components/tabs/__tests__/TabBar.test.tsx
git commit -m "feat(terminal): add terminal toggle to connection tabs"
```

---

### Task 9: Cleanup, Focused Regression Tests, And Final Verification

**Files:**
- Modify tests as needed:
  - `frontend/src/components/panels/__tests__/TerminalTabBar.test.tsx`
  - `frontend/src/components/layout/__tests__/TerminalHost.test.tsx`
  - `frontend/src/components/layout/__tests__/NormalLayout.test.tsx`

- [ ] **Step 1: Search for stale layout-owned terminal references**

Run:

```bash
rg -n "normalLayout-terminal|TerminalBottomDrawer|TerminalHost|useTerminal\\(|TerminalProvider" frontend/src -S
```

Expected:

- `normalLayout-terminal` has no matches.
- `TerminalHost` appears in shell components.
- `TerminalProvider` appears in `TabShell`, tests, and no longer in `App`.
- `TerminalBottomDrawer` appears as the route target registrar and is not rendered inside a drawer panel.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
cd frontend && pnpm exec vitest run \
  src/contexts/__tests__/TerminalTargetContext.test.tsx \
  src/contexts/__tests__/TerminalContext.test.tsx \
  src/components/layout/__tests__/TerminalHost.test.tsx \
  src/components/layout/__tests__/NormalLayout.test.tsx \
  src/components/panels/__tests__/TerminalConnectionFrame.test.tsx \
  src/components/panels/__tests__/TerminalTabBar.test.tsx \
  src/components/tabs/__tests__/TabBar.test.tsx \
  src/components/tabs/__tests__/MultiConnectionShell.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm run frontend:check
```

Expected: PASS.

- [ ] **Step 4: Optional manual verification**

Run the app:

```bash
pnpm run dev
```

Manual checks:

1. In local direct mode, open the app and click the terminal button in the navbar.
2. In multi-connection mode, open the connection home tab and click the top tab bar terminal icon.
3. Open a direct connection project-list tab and click terminal.
4. Open a project tab and confirm the default terminal opens in the project repo.
5. Open a task attempt and confirm task terminal is preferred when workspace is available.
6. Switch tabs while terminal is open and confirm the same drawer/tabs persist.

- [ ] **Step 5: Commit cleanup and verification adjustments**

```bash
git add frontend/src
git commit -m "test(terminal): verify global terminal host integration"
```

---

## Self-Review

Spec coverage:

- Shell-level host: Tasks 4, 5, and 6.
- Direct connection home/project-list terminal: Tasks 7 and 8.
- Connection-bound terminal tabs: Tasks 2 and 3.
- Navbar and top tab bar entry points: Tasks 7 and 8.
- NormalLayout no longer owns drawer: Task 5.
- Error handling for missing/disconnected connections: Task 3.
- Focused verification: Task 9.

No red-flag placeholders remain. Type names introduced in earlier tasks are reused consistently in later tasks.
