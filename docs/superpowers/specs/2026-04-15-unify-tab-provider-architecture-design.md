# Unify Tab Provider Architecture

## Problem

The Tauri multi-tab UI has two bugs when creating tasks:

1. **Dialog appears on wrong tab** — the create task dialog renders in a different tab, not the one where the user clicked "Create".
2. **Dialog doesn't close after creation** — after task creation succeeds, the dialog stays open.

### Root Cause

`App.tsx` was designed as a standalone app (with its own `BrowserRouter`, `LegacyDesignScope`, `UserSystemProvider`, etc.). The tab system wraps it from outside, creating **duplicate providers**:

```
main.tsx → LegacyDesignScope (NiceModal.Provider #1)
  → TabShell
    → ProjectTab → ConnectionProvider → QueryClientProvider
      → App → LegacyDesignScope (NiceModal.Provider #2) → page content
```

NiceModal uses a **single global `dispatch` variable** that gets overwritten by the last Provider to render. With multiple Providers across tabs, `NiceModal.show()` dispatches to whichever Provider rendered last — which is unpredictable and often the wrong tab.

## Design

### 1. Single NiceModal.Provider + Active Connection Bridge

**Remove `LegacyDesignScope` from `App.tsx`** (keep only the one in `main.tsx`). This ensures a single NiceModal.Provider.

**Add `ActiveConnectionBridge`** — a new component that sits inside `LegacyDesignScope`, wrapping `NiceModal.Provider`. It reads the active tab's connection from the connection store and provides `ConnectionProvider` + `QueryClientProvider`:

```
main.tsx → LegacyDesignScope
  → ActiveConnectionBridge
    → ConnectionProvider (active tab's connection)
      → QueryClientProvider (active tab's queryClient)
        → NiceModal.Provider (SINGLE instance)
          ├── children (TabShell, etc.)
          └── Modal components ← rendered INSIDE ConnectionProvider
```

Since NiceModal renders modals as siblings of `{children}` inside its Provider, modals are inside the ConnectionProvider context. All 13 dialogs that use `useApi()` / `useConnection()` work **without modification**.

When HomeTab is active (no connection), the bridge renders children without ConnectionProvider. Dialogs that need connection context should not be shown from HomeTab (they currently aren't — task creation requires a project context inside a tab).

**ActiveConnectionBridge implementation:**

```tsx
// frontend/src/components/legacy-design/ActiveConnectionBridge.tsx
import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';

export function ActiveConnectionBridge({ children }: { children: ReactNode }) {
  const activeTabId = useConnectionStore((s) => s.activeTabId);
  const tabs = useConnectionStore((s) => s.tabs);
  const getConnection = useConnectionStore((s) => s.getConnection);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const conn =
    activeTab?.connectionId
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

### 2. Provider Classification

After investigation, `UserSystemProvider` **cannot** be moved to root — it calls `useApi()` which requires `ConnectionProvider`. `ThemeProvider` depends on `UserSystemProvider` (it reads `config?.theme`). `ClickedElementsProvider` tracks per-tab workspace state via its `attempt` prop.

**Stays per-tab (inside App.tsx):**

| Provider | Why it stays per-tab |
|----------|---------------------|
| `BrowserRouter` | Each tab needs its own routing state. Deep linking and notifications require per-tab URL management. |
| `UserSystemProvider` | Uses `useApi()` → `useConnection()`. Cannot exist above `ConnectionProvider`. |
| `ClickedElementsProvider` | Tracks per-workspace clicked elements via `attempt` prop. |
| `ProjectProvider` | Different project per tab. |
| `SearchProvider` | Search is per-project. |
| `TerminalProvider` / `TerminalDrawerProvider` | Terminal sessions are per-tab. |

**Moves to root (main.tsx):**

| Provider | Why it moves to root |
|----------|---------------------|
| `HotkeysProvider` | No external dependencies. Hotkey scope management is global. |

**Removed from App.tsx entirely:**

| Provider/Wrapper | Why it's removed |
|-----------------|-----------------|
| `LegacyDesignScope` (inside App routes) | Causes the duplicate NiceModal.Provider bug. The root-level `LegacyDesignScope` already provides the `legacy-design` CSS class and NiceModal.Provider. |

### 3. App.tsx Refactoring

**Before:**
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

**After:**
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

Changes:
- Remove `HotkeysProvider` wrapper (moved to `main.tsx`)
- Keep `UserSystemProvider`, `ClickedElementsProvider`, `ProjectProvider` per-tab (they depend on connection or per-tab state)

### 4. AppContent Refactoring

Remove `LegacyDesignScope` wrappers from route definitions in `AppContent`. The root `LegacyDesignScope` already provides the `legacy-design` CSS class above all tabs.

**Before (`AppContent` routes):**
```tsx
<Route
  path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
  element={<LegacyDesignScope><FullAttemptLogsPage /></LegacyDesignScope>}
/>
<Route element={<LegacyDesignScope><NormalLayout /></LegacyDesignScope>}>
  ...
</Route>
```

**After:**
```tsx
<Route
  path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
  element={<FullAttemptLogsPage />}
/>
<Route element={<NormalLayout />}>
  ...
</Route>
```

The `legacy-design` CSS class is already on the root wrapper div in `main.tsx`. Removing the inner `LegacyDesignScope` eliminates the duplicate `NiceModal.Provider` and `PortalContainerContext.Provider`.

### 5. LegacyDesignScope Update

Add `ActiveConnectionBridge` inside `LegacyDesignScope`, wrapping `NiceModal.Provider`:

```tsx
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

### 6. main.tsx Update

Add `HotkeysProvider` at root level:

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthog}>
        <Sentry.ErrorBoundary ...>
          <ClickToComponent />
          <HotkeysProvider initiallyActiveScopes={['global', 'projects']}>
            <LegacyDesignScope>
              <TabShell />
            </LegacyDesignScope>
          </HotkeysProvider>
        </Sentry.ErrorBoundary>
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

### 7. ThemeProvider Placement

`ThemeProvider` currently lives in `AppContent` and receives `initialTheme` from `useUserSystem()`. Since `UserSystemProvider` stays per-tab, `ThemeProvider` also stays per-tab inside `AppContent`. This is fine — `ThemeProvider` writes to `document.documentElement` (global DOM), so all tabs share the same active theme, and the active tab's ThemeProvider "wins".

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/legacy-design/ActiveConnectionBridge.tsx` | **New file** — reads active tab connection from connection store, wraps children with `ConnectionProvider` + `QueryClientProvider` when a connection is active |
| `frontend/src/components/legacy-design/LegacyDesignScope.tsx` | Import and wrap `NiceModal.Provider` with `ActiveConnectionBridge` |
| `frontend/src/main.tsx` | Add `HotkeysProvider` wrapping `LegacyDesignScope`. Add import for `HotkeysProvider`. |
| `frontend/src/App.tsx` | Remove `HotkeysProvider` wrapper. Remove `LegacyDesignScope` import if unused. |
| `frontend/src/App.tsx` (`AppContent`) | Remove `LegacyDesignScope` wrappers from route `element` props |

### Files NOT Changed

- **All 13 dialog files** — no modifications needed. They continue to use `useApi()` / `useConnection()` and it works because NiceModal now renders them inside the active tab's ConnectionProvider via ActiveConnectionBridge.
- **`openTaskForm.ts`** — no changes needed.
- **`connection-store.ts`** — no changes needed (ActiveConnectionBridge derives the active connection from existing store state).
- **Tab components** (`TabShell.tsx`, `ProjectTab.tsx`, `MachineProjectsTab.tsx`) — no changes needed.

## Edge Cases

1. **HomeTab dialogs**: When HomeTab is active, there's no connection. The `ActiveConnectionBridge` renders without `ConnectionProvider`. Dialogs that need connection context should not be shown from HomeTab (they currently aren't — task creation requires a project context inside a tab).

2. **Tab switching while dialog is open**: If a user opens a dialog in Tab A then switches to Tab B, the `ActiveConnectionBridge`'s ConnectionProvider updates to Tab B's connection. The open dialog would now use Tab B's connection context. In practice, tab switching while a dialog is open is unlikely because the dialog overlay blocks interaction. If this becomes an issue later, we can capture the connection at dialog-open time and pass it as a prop.

3. **MachineProjectsTab**: This tab has its own `ConnectionProvider` wrapping `App`. When modals are triggered from inside the App (inside the tab), they render in the root NiceModal.Provider (which now gets the active tab's connection from ActiveConnectionBridge). Since the active tab IS the MachineProjectsTab in that case, the connection matches.

4. **Multiple BrowserRouter instances**: Each tab still creates its own BrowserRouter inside App. This is by design — each tab needs independent routing state. The browser URL reflects the active tab's current page. Since inactive tabs are hidden via CSS, their BrowserRouter instances don't cause visible conflicts. Deep linking and notifications continue to work.

5. **Nested ConnectionProvider**: Each tab still has its own `ConnectionProvider` (from `ProjectTab`). Components inside a tab use the closest `ConnectionProvider` (the tab's own), not the bridge's. Modals rendered by NiceModal at the root level use the bridge's `ConnectionProvider` (the active tab's connection). These are the same connection when the modal is opened from the active tab.

## Verification

After implementation, verify:

1. Create task dialog opens in the correct (active) tab
2. After creating a task, the dialog closes automatically
3. Task is created on the correct connection (active tab's backend)
4. Edit/duplicate/subtask task dialogs work correctly
5. Other dialogs that use `useApi()` work (e.g., CreatePRDialog, DeleteTaskConfirmationDialog)
6. Settings pages work (they use `useApi()` too)
7. HomeTab works normally (no connection-related errors)
8. Theme, hotkeys, user config work across all tabs
9. `pnpm run check` and `pnpm run lint` pass
