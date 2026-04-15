# Unify Tab Provider Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two Tauri multi-tab bugs (dialog on wrong tab, dialog doesn't close) by eliminating duplicate NiceModal.Provider instances and bridging the active tab's connection context to the modal layer.

**Architecture:** Remove `LegacyDesignScope` wrappers from `App.tsx` routes (eliminating duplicate NiceModal.Provider). Add `ActiveConnectionBridge` inside the root `LegacyDesignScope` so modals rendered by NiceModal inherit the active tab's `ConnectionProvider` + `QueryClientProvider`. Move `HotkeysProvider` from per-tab `App.tsx` to root `main.tsx`.

**Tech Stack:** React, TypeScript, Zustand (connection-store), @ebay/nice-modal-react, @tanstack/react-query, react-hotkeys-hook

**Spec:** `docs/superpowers/specs/2026-04-15-unify-tab-provider-architecture-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/legacy-design/ActiveConnectionBridge.tsx` | **Create** | Reads active tab from connection store, wraps children with `ConnectionProvider` + `QueryClientProvider` when a connected tab is active |
| `frontend/src/components/legacy-design/LegacyDesignScope.tsx` | **Modify** | Import `ActiveConnectionBridge`, insert it wrapping `NiceModal.Provider` |
| `frontend/src/main.tsx` | **Modify** | Add `HotkeysProvider` wrapping `LegacyDesignScope` |
| `frontend/src/App.tsx` | **Modify** | Remove `HotkeysProvider` wrapper from `App()`, remove `LegacyDesignScope` wrappers from route elements in `AppContent()`, remove unused `LegacyDesignScope` import |

---

### Task 1: Create ActiveConnectionBridge

**Files:**
- Create: `frontend/src/components/legacy-design/ActiveConnectionBridge.tsx`

- [ ] **Step 1: Create the ActiveConnectionBridge component**

```tsx
// frontend/src/components/legacy-design/ActiveConnectionBridge.tsx
import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';

export function ActiveConnectionBridge({
  children,
}: {
  children: ReactNode;
}) {
  const activeTabId = useConnectionStore((s) => s.activeTabId);
  const tabs = useConnectionStore((s) => s.tabs);
  const getConnection = useConnectionStore((s) => s.getConnection);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const conn = activeTab?.connectionId
    ? getConnection(activeTab.connectionId, activeTab.machineId)
    : null;

  if (!conn || conn.status !== 'connected') {
    return <>{children}</>;
  }

  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        {children}
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/b5d2-tauri-create-tas/vibe-kanban && pnpm run check`

Expected: No errors related to `ActiveConnectionBridge.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/legacy-design/ActiveConnectionBridge.tsx
git commit -m "feat(tabs): add ActiveConnectionBridge for modal connection context"
```

---

### Task 2: Wire ActiveConnectionBridge into LegacyDesignScope

**Files:**
- Modify: `frontend/src/components/legacy-design/LegacyDesignScope.tsx`

- [ ] **Step 1: Add ActiveConnectionBridge wrapping NiceModal.Provider**

Replace the entire file content of `frontend/src/components/legacy-design/LegacyDesignScope.tsx` with:

```tsx
import { ReactNode, useState } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import NiceModal from '@ebay/nice-modal-react';
import { ActiveConnectionBridge } from './ActiveConnectionBridge';
import '@/styles/legacy/index.css';

interface LegacyDesignScopeProps {
  children: ReactNode;
}

export function LegacyDesignScope({ children }: LegacyDesignScopeProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <div ref={setContainer} className="legacy-design min-h-screen">
      {container && (
        <PortalContainerContext.Provider value={container}>
          <ActiveConnectionBridge>
            <NiceModal.Provider>{children}</NiceModal.Provider>
          </ActiveConnectionBridge>
        </PortalContainerContext.Provider>
      )}
    </div>
  );
}
```

The only change from the original: import `ActiveConnectionBridge` and wrap `<NiceModal.Provider>` with `<ActiveConnectionBridge>`.

- [ ] **Step 2: Verify no type errors**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/b5d2-tauri-create-tas/vibe-kanban && pnpm run check`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/legacy-design/LegacyDesignScope.tsx
git commit -m "feat(tabs): wire ActiveConnectionBridge into LegacyDesignScope"
```

---

### Task 3: Move HotkeysProvider to root main.tsx

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Add HotkeysProvider wrapping LegacyDesignScope in main.tsx**

In `frontend/src/main.tsx`, add the import at the top (after the existing imports):

```tsx
import { HotkeysProvider } from 'react-hotkeys-hook';
```

Then in the render tree, wrap `<LegacyDesignScope>` with `<HotkeysProvider>`. The render block (lines 79-97) becomes:

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthog}>
        <Sentry.ErrorBoundary
          fallback={<p>{i18n.t('common:states.error')}</p>}
          showDialog
        >
          <ClickToComponent />
          <HotkeysProvider initiallyActiveScopes={['global', 'projects']}>
            <LegacyDesignScope>
              <TabShell />
            </LegacyDesignScope>
          </HotkeysProvider>
          {/*<TanStackDevtools plugins={[FormDevtoolsPlugin()]} />*/}
          {/* <ReactQueryDevtools initialIsOpen={false} /> */}
        </Sentry.ErrorBoundary>
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Verify no type errors**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/b5d2-tauri-create-tas/vibe-kanban && pnpm run check`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "refactor(tabs): move HotkeysProvider to root main.tsx"
```

---

### Task 4: Remove HotkeysProvider and LegacyDesignScope from App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Remove HotkeysProvider from App() function**

In `frontend/src/App.tsx`, change the `App()` function (lines 166-180) from:

```tsx
function App() {
  return (
    <BrowserRouter>
      <UserSystemProvider>
        <ClickedElementsProvider>
          <ProjectProvider>
            <HotkeysProvider initiallyActiveScopes={['global', 'projects']}>
              <AppContent />
            </HotkeysProvider>
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}
```

to:

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

- [ ] **Step 2: Remove LegacyDesignScope wrappers from AppContent route elements**

In `AppContent()`, change the full-page logs route element (lines 110-116) from:

```tsx
<Route
  path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
  element={
    <LegacyDesignScope>
      <FullAttemptLogsPage />
    </LegacyDesignScope>
  }
/>
```

to:

```tsx
<Route
  path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
  element={<FullAttemptLogsPage />}
/>
```

And change the main layout route (lines 119-125) from:

```tsx
<Route
  element={
    <LegacyDesignScope>
      <NormalLayout />
    </LegacyDesignScope>
  }
>
```

to:

```tsx
<Route element={<NormalLayout />}>
```

- [ ] **Step 3: Remove unused imports**

Remove these imports from the top of `App.tsx` since they are no longer used:

```tsx
// Remove this line:
import { HotkeysProvider } from 'react-hotkeys-hook';

// Remove this line:
import { LegacyDesignScope } from '@/components/legacy-design/LegacyDesignScope';
```

- [ ] **Step 4: Verify no type errors**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/b5d2-tauri-create-tas/vibe-kanban && pnpm run check`

Expected: No errors. The `HotkeysProvider` is now at root (main.tsx) and `LegacyDesignScope` only exists at root.

- [ ] **Step 5: Run lint**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/b5d2-tauri-create-tas/vibe-kanban && pnpm run lint`

Expected: No new lint errors. Particularly verify no "unused import" warnings for `HotkeysProvider` or `LegacyDesignScope`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor(tabs): remove duplicate LegacyDesignScope and HotkeysProvider from App.tsx

Eliminates duplicate NiceModal.Provider that caused dialogs to render
in wrong tabs. HotkeysProvider moved to root main.tsx."
```

---

### Task 5: Verify the fix works end-to-end

- [ ] **Step 1: Run type check**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/b5d2-tauri-create-tas/vibe-kanban && pnpm run check`

Expected: All type checks pass.

- [ ] **Step 2: Run lint**

Run: `cd /home/wangqiying/projects/.vibe-board-workspaces/b5d2-tauri-create-tas/vibe-kanban && pnpm run lint`

Expected: No new lint errors.

- [ ] **Step 3: Manual verification checklist**

If running the Tauri app locally, verify:

1. Open a project tab and click "Create Task" — dialog appears correctly in the active tab
2. Fill in the form and click "Create" — dialog closes automatically after creation
3. The task appears in the correct project's task list
4. Open a second project tab, create a task there — it creates in the correct tab
5. Edit/duplicate task dialogs work correctly
6. Settings pages load and function (they use `useApi()`)
7. HomeTab connection management works (no errors from missing ConnectionProvider)
8. Keyboard shortcuts work (hotkeys)
