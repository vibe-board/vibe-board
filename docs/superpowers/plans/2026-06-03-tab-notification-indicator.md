# Tab Notification Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a notification dot on project tabs when task status changes or approval requests arrive, so users can see which inactive tabs need attention.

**Architecture:** A new Zustand store (`tabNotificationStore`) tracks which tabs have pending notifications. The existing `useTaskNotifications` hook marks tabs when notifications fire. The `TabBar` subscribes to the store and renders a dot. Switching to a tab auto-clears its indicator.

**Tech Stack:** React, TypeScript, Zustand, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/stores/tab-notification-store.ts` | **New** | Zustand store: `markNotification`, `clearNotification`, `clearAll` |
| `frontend/src/stores/__tests__/tab-notification-store.test.ts` | **New** | Unit tests for the store |
| `frontend/src/contexts/TabIdContext.tsx` | **New** | Context + `useTabId` hook for passing tab ID down the tree |
| `frontend/src/hooks/useTaskNotifications.ts` | Modify | Accept optional `tabId`, call `markNotification` on notify |
| `frontend/src/hooks/__tests__/useTaskNotifications.test.ts` | **New** | Tests for the tab notification integration |
| `frontend/src/components/tabs/ProjectTab.tsx` | Modify | Wrap `<App>` in `<TabIdProvider value={tab.id}>` |
| `frontend/src/pages/ProjectTasks.tsx` | Modify | Read `useTabId()`, pass to `useTaskNotifications` |
| `frontend/src/stores/connection-store.ts` | Modify | `setActiveTab` clears notification; `removeConnection`/`logoutConnection` clear all |
| `frontend/src/components/tabs/TabBar.tsx` | Modify | Subscribe to store, render dot indicator |

---

### Task 1: Create `tabNotificationStore`

**Files:**
- Create: `frontend/src/stores/tab-notification-store.ts`
- Create: `frontend/src/stores/__tests__/tab-notification-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/stores/__tests__/tab-notification-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useTabNotificationStore } from '../tab-notification-store';

describe('tabNotificationStore', () => {
  beforeEach(() => {
    useTabNotificationStore.getState().clearAll();
  });

  it('starts with empty notifications', () => {
    const { notifications } = useTabNotificationStore.getState();
    expect(notifications).toEqual({});
  });

  it('markNotification adds a tab entry', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    expect(useTabNotificationStore.getState().notifications).toEqual({ 'tab-1': true });
  });

  it('markNotification is idempotent', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    useTabNotificationStore.getState().markNotification('tab-1');
    expect(useTabNotificationStore.getState().notifications).toEqual({ 'tab-1': true });
  });

  it('clearNotification removes a specific tab entry', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    useTabNotificationStore.getState().markNotification('tab-2');
    useTabNotificationStore.getState().clearNotification('tab-1');
    expect(useTabNotificationStore.getState().notifications).toEqual({ 'tab-2': true });
  });

  it('clearNotification is safe for non-existent tab', () => {
    useTabNotificationStore.getState().clearNotification('nonexistent');
    expect(useTabNotificationStore.getState().notifications).toEqual({});
  });

  it('clearAll removes all entries', () => {
    useTabNotificationStore.getState().markNotification('tab-1');
    useTabNotificationStore.getState().markNotification('tab-2');
    useTabNotificationStore.getState().clearAll();
    expect(useTabNotificationStore.getState().notifications).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/__tests__/tab-notification-store.test.ts`
Expected: FAIL — module `../tab-notification-store` not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/stores/tab-notification-store.ts
import { create } from 'zustand';

interface TabNotificationState {
  notifications: Record<string, boolean>;
  markNotification(tabId: string): void;
  clearNotification(tabId: string): void;
  clearAll(): void;
}

export const useTabNotificationStore = create<TabNotificationState>((set) => ({
  notifications: {},
  markNotification(tabId) {
    set((s) => ({ notifications: { ...s.notifications, [tabId]: true } }));
  },
  clearNotification(tabId) {
    set((s) => {
      const { [tabId]: _, ...rest } = s.notifications;
      return { notifications: rest };
    });
  },
  clearAll() {
    set({ notifications: {} });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/__tests__/tab-notification-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/tab-notification-store.ts frontend/src/stores/__tests__/tab-notification-store.test.ts
git commit -m "feat: add tabNotificationStore for tracking tab notification state"
```

---

### Task 2: Create `TabIdContext`

**Files:**
- Create: `frontend/src/contexts/TabIdContext.tsx`

- [ ] **Step 1: Create the context**

```typescript
// frontend/src/contexts/TabIdContext.tsx
import { createContext, useContext } from 'react';

const TabIdContext = createContext<string | undefined>(undefined);

export const TabIdProvider = TabIdContext.Provider;

export function useTabId(): string | undefined {
  return useContext(TabIdContext);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors related to `TabIdContext`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/TabIdContext.tsx
git commit -m "feat: add TabIdContext for passing tab ID down the component tree"
```

---

### Task 3: Wire `ProjectTab` to provide tab ID

**Files:**
- Modify: `frontend/src/components/tabs/ProjectTab.tsx`

- [ ] **Step 1: Add import and wrap `<App>`**

At the top of `ProjectTab.tsx`, add the import:

```typescript
import { TabIdProvider } from '@/contexts/TabIdContext';
```

In the return statement, wrap `<App>` in `<TabIdProvider>`:

```tsx
return (
  <ConnectionProvider connection={conn}>
    <QueryClientProvider client={conn.queryClient}>
      <ProjectsNavigationProvider value={{ navigateToProjects }}>
        <TabIdProvider value={tab.id}>
          <App initialPath={`/local-projects/${tab.projectId}/tasks`} />
        </TabIdProvider>
      </ProjectsNavigationProvider>
    </QueryClientProvider>
  </ConnectionProvider>
);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/ProjectTab.tsx
git commit -m "feat: wrap ProjectTab App in TabIdProvider"
```

---

### Task 4: Integrate tab ID into `useTaskNotifications`

**Files:**
- Modify: `frontend/src/hooks/useTaskNotifications.ts`
- Create: `frontend/src/hooks/__tests__/useTaskNotifications.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/hooks/__tests__/useTaskNotifications.test.ts
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import type { Task, ApprovalInfo, Config } from 'shared/types';
import { useTaskNotifications } from '../useTaskNotifications';
import { useTabNotificationStore } from '@/stores/tab-notification-store';

// Mock the connection context
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({ url: 'http://localhost' }),
}));

// Mock notification sound
vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(() => Promise.resolve()),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    status: 'running',
    executor: 'claude',
    project_id: 'proj-1',
    ...overrides,
  } as Task;
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    notifications: {
      sound_enabled: false,
      push_enabled: false,
      sound_file: 'CowMooing',
    },
    ...overrides,
  } as Config;
}

describe('useTaskNotifications — tab notification integration', () => {
  beforeEach(() => {
    useTabNotificationStore.getState().clearAll();
    vi.clearAllMocks();
  });

  it('marks tab notification when task transitions to inreview', () => {
    const initialTasks = { 'task-1': makeTask({ status: 'running' }) };
    const { rerender } = renderHook(
      ({ tasks, tabId }) => useTaskNotifications(tasks, [], makeConfig(), tabId),
      { initialProps: { tasks: initialTasks, tabId: 'tab-1' } }
    );

    // Simulate task status change to inreview
    const updatedTasks = { 'task-1': makeTask({ status: 'inreview' }) };
    rerender({ tasks: updatedTasks, tabId: 'tab-1' });

    expect(useTabNotificationStore.getState().notifications['tab-1']).toBe(true);
  });

  it('marks tab notification when new approval appears', () => {
    const { rerender } = renderHook(
      ({ approvals, tabId }) => useTaskNotifications({}, approvals, makeConfig(), tabId),
      {
        initialProps: {
          approvals: [] as ApprovalInfo[],
          tabId: 'tab-1',
        },
      }
    );

    const newApproval: ApprovalInfo = {
      approval_id: 'a1',
      tool_name: 'Bash',
      execution_process_id: 'ep1',
      task_id: 'task-1',
      is_question: false,
      created_at: '2026-06-03T00:00:00Z',
      timeout_at: '2026-06-03T00:01:00Z',
    } as ApprovalInfo;

    rerender({ approvals: [newApproval], tabId: 'tab-1' });

    expect(useTabNotificationStore.getState().notifications['tab-1']).toBe(true);
  });

  it('does not mark tab notification when tabId is undefined', () => {
    const initialTasks = { 'task-1': makeTask({ status: 'running' }) };
    const { rerender } = renderHook(
      ({ tasks }) => useTaskNotifications(tasks, [], makeConfig()),
      { initialProps: { tasks: initialTasks } }
    );

    const updatedTasks = { 'task-1': makeTask({ status: 'inreview' }) };
    rerender({ tasks: updatedTasks });

    expect(useTabNotificationStore.getState().notifications).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useTaskNotifications.test.ts`
Expected: FAIL — `useTaskNotifications` does not accept 4 arguments

- [ ] **Step 3: Modify `useTaskNotifications` to accept `tabId` and mark notifications**

Add import at top of `frontend/src/hooks/useTaskNotifications.ts`:

```typescript
import { useTabNotificationStore } from '@/stores/tab-notification-store';
```

Change the function signature (line 25-29):

```typescript
export function useTaskNotifications(
  tasksById: Record<string, Task>,
  pendingApprovals: ApprovalInfo[],
  config: Config | null,
  tabId?: string
) {
```

In the task status change `useEffect` (around line 110), after `triggerNotification('Review Needed', ...)`, add:

```typescript
if (tabId) {
  useTabNotificationStore.getState().markNotification(tabId);
}
```

In the approval `useEffect` (around line 133), after `triggerNotification(title, approval.tool_name)`, add:

```typescript
if (tabId) {
  useTabNotificationStore.getState().markNotification(tabId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useTaskNotifications.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTaskNotifications.ts frontend/src/hooks/__tests__/useTaskNotifications.test.ts
git commit -m "feat: integrate tab notification marking into useTaskNotifications"
```

---

### Task 5: Pass tab ID in `ProjectTasks`

**Files:**
- Modify: `frontend/src/pages/ProjectTasks.tsx`

- [ ] **Step 1: Add import**

At the top of `ProjectTasks.tsx`, add:

```typescript
import { useTabId } from '@/contexts/TabIdContext';
```

- [ ] **Step 2: Read tab ID and pass to hook**

Find line 262:

```typescript
useTaskNotifications(tasksById, pendingApprovals, config);
```

Replace with:

```typescript
const tabId = useTabId();
useTaskNotifications(tasksById, pendingApprovals, config, tabId);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProjectTasks.tsx
git commit -m "feat: pass tabId to useTaskNotifications from ProjectTasks"
```

---

### Task 6: Auto-clear on tab switch and connection cleanup

**Files:**
- Modify: `frontend/src/stores/connection-store.ts`

- [ ] **Step 1: Add import**

At the top of `connection-store.ts`, add:

```typescript
import { useTabNotificationStore } from './tab-notification-store';
```

- [ ] **Step 2: Clear notification in `setActiveTab`**

Find the `setActiveTab` action (line 544-547):

```typescript
setActiveTab(tabId) {
  saveActiveTab(tabId);
  set({ activeTabId: tabId });
},
```

Replace with:

```typescript
setActiveTab(tabId) {
  saveActiveTab(tabId);
  set({ activeTabId: tabId });
  useTabNotificationStore.getState().clearNotification(tabId);
},
```

- [ ] **Step 3: Clear all notifications in `removeConnection`**

Find the end of the `removeConnection` action (around line 335-336), before the closing `});`:

```typescript
return { nodes, tabs, activeTabId };
```

Add before that line:

```typescript
useTabNotificationStore.getState().clearAll();
```

- [ ] **Step 4: Clear all notifications in `logoutConnection`**

Find the end of the `logoutConnection` action (around line 388-389), before the closing `});`:

```typescript
return { nodes: [...s.nodes], tabs, activeTabId };
```

Add before that line:

```typescript
useTabNotificationStore.getState().clearAll();
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/connection-store.ts
git commit -m "feat: auto-clear tab notifications on tab switch and connection removal"
```

---

### Task 7: Render dot indicator in `TabBar`

**Files:**
- Modify: `frontend/src/components/tabs/TabBar.tsx`

- [ ] **Step 1: Add import**

At the top of `TabBar.tsx`, add:

```typescript
import { useTabNotificationStore } from '@/stores/tab-notification-store';
```

- [ ] **Step 2: Subscribe to notification store**

Inside the `TabBar` function, after the existing `useConnectionStore` call (line 7), add:

```typescript
const notifications = useTabNotificationStore((s) => s.notifications);
```

- [ ] **Step 3: Add dot indicator to tab rendering**

Find the tab rendering section (line 32-57). The `<div>` for each tab currently ends at line 56. Add the dot indicator inside the tab `<div>`, after the close button:

```tsx
{tabs.map((tab) => (
  <div
    key={tab.id}
    className={`group relative flex items-center gap-1.5 px-4 py-2 text-sm border-r border-border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
      activeTabId === tab.id
        ? 'bg-background text-foreground font-medium'
        : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
    }`}
    onClick={() => setActiveTab(tab.id)}
    title={tab.label}
  >
    {tab.type === 'machine-projects' && (
      <Monitor size={14} className="shrink-0 text-foreground/50" />
    )}
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
    {notifications[tab.id] && activeTabId !== tab.id && (
      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand" />
    )}
  </div>
))}
```

Note: `relative` is added to the tab `<div>` so the `absolute`-positioned dot anchors correctly. `bg-brand` is the orange accent color from the legacy design system.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tabs/TabBar.tsx
git commit -m "feat: render notification dot indicator on tabs"
```

---

### Task 8: Type check and lint

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript type check**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `cd frontend && pnpm run lint`
Expected: No errors

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Fix any issues found**

Address any type errors, lint warnings, or test failures.

- [ ] **Step 5: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix: address type/lint issues from tab notification indicator"
```
