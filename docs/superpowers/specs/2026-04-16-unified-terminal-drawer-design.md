# Unified Terminal Bottom Drawer

## Problem

The app has two independent terminal systems that can both be open simultaneously:

1. **Task-level terminal**: A view mode in `AttemptHeaderActions` (alongside preview/diffs/commits) that renders a `TerminalPanel` inside the right work area's aux panel via `TasksLayout` -> `AuxRouter`. Uses workspace-based WebSocket endpoint (`/api/terminal/ws?workspace_id=...`).

2. **Global terminal drawer**: A button in `Navbar` that opens a `DirectTerminalPanel` as a right-side drawer in `NormalLayout`. Uses direct WebSocket endpoint (`/api/terminal/direct-ws?cwd=...`). State managed by `TerminalDrawerContext`.

This creates a confusing UX where two terminal panels can be visible at the same time, with separate state management and different interaction patterns.

## Solution

Unify into a **single bottom drawer** rendered in `NormalLayout`, available globally regardless of current page/view. Remove all terminal logic from `TasksLayout` and `AttemptHeaderActions`.

### Layout

```
+-----------------------------------------------------------+
|  Navbar  [... buttons ...] [Terminal]  [Settings] [Menu]   |
+-----------------------------------------------------------+
|                                                           |
|   Page Content (Outlet)                                   |
|     - On ProjectTasks page:                               |
|       Kanban | TaskDetail | Aux(preview/diffs/commits)    |
|                                                           |
+===========================================================+  <-- resizable separator
|  Terminal Tab Bar  [Task:fix-bug x] [Project x]  [+ v]    |
|  $ npm run dev                                            |
|  > ready on http://localhost:3000                          |
+-----------------------------------------------------------+
```

## Design Decisions

### 1. Rendering Location

The terminal panel renders in `NormalLayout`, below the Outlet, using `react-resizable-panels` with a vertical `Group`:

```
Group (vertical)
  Panel (content) — Navbar + Outlet
  Separator (horizontal drag handle)
  Panel (terminal) — TerminalTabBar + XTermInstance tabs
```

The terminal panel is collapsible. When closed, only the content panel is visible at 100%. The separator and terminal panel appear when the drawer is opened.

### 2. Remove Terminal from TasksLayout

- Remove `terminal` prop from `TasksLayout` and `TasksLayoutProps`
- Remove `'terminal'` from `LayoutMode` type: `'preview' | 'diffs' | 'commits' | null`
- Remove terminal handling from `AuxRouter` (the `hasEverMountedTerminal` ref and terminal div)
- Remove the terminal toggle button from `AttemptHeaderActions`
- Remove `terminalContent` and related `terminalCwd` computation from `ProjectTasks.tsx`
- Remove `'terminal'` from keyboard cycle view order

### 3. Remove TerminalDrawerContext

Merge drawer open/close state into `TerminalContext`:

**Add to TerminalState:**
- `isDrawerOpen: boolean`

**Add to TerminalAction:**
- `{ type: 'OPEN_DRAWER' }`
- `{ type: 'CLOSE_DRAWER' }`
- `{ type: 'TOGGLE_DRAWER' }`

**Add to TerminalContextType:**
- `isDrawerOpen: boolean`
- `openDrawer: () => void`
- `closeDrawer: () => void`
- `toggleDrawer: () => void`

Delete `TerminalDrawerContext.tsx` and its provider from the component tree. Update all consumers (`Navbar.tsx`, `NormalLayout.tsx`) to use `useTerminal()` instead.

### 4. Tab Context System

Each terminal tab has a `context` field indicating what it's connected to:

```typescript
type TerminalTabContext =
  | { type: 'task'; attemptId: string; taskId: string }
  | { type: 'project'; projectId: string }
  | { type: 'home' };
```

**Add to TerminalTab:**
```typescript
export interface TerminalTab {
  id: string;
  title: string;
  workspaceId: string;
  taskId: string;       // keep for backward compat, derived from context
  cwd: string;
  sessionId: string | null;
  context: TerminalTabContext;
}
```

Each context type determines:
- **Task**: `workspaceId = attempt.id`, endpoint = `/api/terminal/ws?workspace_id=...`
- **Project**: `workspaceId = project-terminal:{projectId}`, endpoint = `/api/terminal/direct-ws?cwd=...`
- **Home**: `workspaceId = global-terminal`, endpoint = `/api/terminal/direct-ws?cwd=...`

### 5. New Tab Dropdown

Replace the simple "+" button in `TerminalTabBar` with a dropdown menu:

```
[+] dropdown:
  - "Task Terminal"     (disabled if no active task workspace)
  - "Project Terminal"  (disabled if not on a project page)
  - "Home Directory"
```

The dropdown needs access to current navigation context (selected task/attempt, current project). This is passed down as props to the terminal panel component, which passes available contexts to the tab bar.

### 6. Smart Auto-Open via Navbar Button

When the Navbar terminal button is clicked:
1. If drawer is open -> close it (toggle behavior, same as now)
2. If drawer is closed -> open it:
   - If a task with an active workspace is selected -> create/focus a task terminal tab
   - Else if on a project page -> create/focus a project terminal tab  
   - Else -> create/focus a home directory terminal tab

The Navbar button continues to use `useTerminal()` (previously `useTerminalDrawer()`). It determines context from the current route and project state.

### 7. Keep-Alive Strategy

Same as current implementation:
- Terminal panel is mounted once opened, hidden via `display: none` when closed
- xterm.js instances and WebSocket connections are preserved
- Uses a `hasEverOpened` ref pattern to avoid mounting until first open

### 8. Resizable Panels

`NormalLayout` switches from a simple flex layout to `react-resizable-panels`:

```tsx
<Group orientation="vertical">
  <Panel id="content" defaultSize={hasEverOpened ? 70 : 100} minSize={30}>
    <Navbar />
    <Outlet />
  </Panel>
  {/* Always rendered once opened to preserve xterm state; hidden via collapsed panel */}
  {hasEverOpened && (
    <>
      <Separator id="terminal-handle" />
      <Panel
        id="terminal"
        defaultSize={isDrawerOpen ? 30 : 0}
        minSize={15}
        collapsible
        collapsedSize={0}
      >
        <TerminalBottomPanel ... />
      </Panel>
    </>
  )}
</Group>
```

The `hasEverOpened` ref ensures the terminal panel is never mounted until the user first opens it. Once mounted, the panel stays in the tree — opening/closing is done by expanding/collapsing the panel (size 0 vs 30%), not by conditional rendering. This preserves xterm.js instances and WebSocket connections.

The terminal panel height is persisted via `useDefaultLayout` (same pattern used by `TasksLayout` for the attempt/aux split).

## Files Changed

### Delete
- `frontend/src/contexts/TerminalDrawerContext.tsx`

### Modify
- `frontend/src/contexts/TerminalContext.tsx` — add drawer state, tab context type
- `frontend/src/components/layout/NormalLayout.tsx` — replace right drawer with bottom resizable panel
- `frontend/src/components/layout/Navbar.tsx` — use `useTerminal()` instead of `useTerminalDrawer()`
- `frontend/src/components/panels/TerminalTabBar.tsx` — add "+" dropdown with context options
- `frontend/src/components/panels/TerminalPanel.tsx` — accept available contexts, pass to tab bar
- `frontend/src/components/panels/AttemptHeaderActions.tsx` — remove terminal toggle button
- `frontend/src/components/layout/TasksLayout.tsx` — remove `terminal` prop, remove `'terminal'` from `LayoutMode`, simplify `AuxRouter`
- `frontend/src/pages/ProjectTasks.tsx` — remove `terminalContent`, `terminalCwd`, remove `'terminal'` from view cycle
- `frontend/src/App.tsx` — remove `TerminalDrawerProvider` from provider tree

### No Change
- `frontend/src/components/panels/XTermInstance.tsx` — unchanged, works with any endpoint URL
- `frontend/src/utils/terminalTheme.ts` — unchanged

## Edge Cases

- **No active workspace**: "Task Terminal" option is disabled in the dropdown. User sees only Project/Home options.
- **Task completed/cancelled (workspace cleaned up)**: If a task terminal tab's workspace is gone, the tab shows an error message and can be closed. No new task terminal can be created for that task.
- **Navigation away from project**: Existing terminal tabs remain open (they have their own WebSocket connections). They don't auto-close — user can keep using them.
- **Multiple tabs same context**: Allowed. User can have 2 project terminals, 3 task terminals, etc. Each gets its own PTY session.
