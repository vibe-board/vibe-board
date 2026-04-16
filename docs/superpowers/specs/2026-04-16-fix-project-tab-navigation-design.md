# Fix Project Tab Navigation & State Isolation

**Date:** 2026-04-16
**Status:** Draft

## Problem

Two bugs in the multi-tab project navigation:

### Bug 1: Duplicate projects page

When a user clicks a project in `MachineProjectsTab`:
1. `MachineProjectsTab` sets `activeProjectId` (View B) and renders `<App />`
2. `<App />` contains a `BrowserRouter` that starts at `/`
3. Route `/` maps to `<Projects />` which renders `<ProjectList />`
4. User sees MachineProjectsTab's "Back to projects" header + the old ProjectList (a second projects page)

### Bug 2: Tab state loss

When a user navigates to a task inside a tab, then switches to another tab and back:
1. All tabs share a single `BrowserRouter` (browser URL)
2. Switching tabs changes the URL, so the previous tab's route state is lost
3. The tab resets to the root route (`/` → ProjectList)

## Design

### Principle

**Tab = persistent work context.** Each tab should remember where the user left off.

- **Home tab** — connection management, machine list entry
- **Machine tab** (`machine-projects`) — browse and select projects on a machine. This is a navigation hub, not a workspace.
- **Project tab** (`project`) — a complete workspace for a specific project (kanban, tasks, diffs, terminal, etc.)

### Changes

#### 1. MachineProjectsTab: Remove View B, always use openProjectTab

Currently `MachineProjectsTab` has two views:
- View A: Project list (when `activeProjectId === null`)
- View B: Embedded `<App />` (when `activeProjectId` is set)

**Change:** Remove View B entirely. When a user clicks a project card, call `openProjectTab()` from the connection store instead of setting `activeProjectId`. The machine tab stays on the project list — the project opens in its own tab.

This means:
- Remove the `activeProjectId` state from `MachineProjectsTab`
- Remove the View B rendering block (lines 99-121)
- Change `onSelectProject` callback in `ProjectListView` to call `openProjectTab` instead

#### 2. App: Accept optional initialPath and use MemoryRouter when embedded

Currently `App` always wraps content in `BrowserRouter`, causing all tabs to share the browser URL.

**Change:** Add an optional `initialPath` prop to `App`. When provided:
- Use `MemoryRouter` with `initialEntries={[initialPath]}` instead of `BrowserRouter`
- This isolates each tab's routing state

When `initialPath` is not provided (standalone mode), keep `BrowserRouter` for backward compatibility.

#### 3. ProjectTab: Pass initialPath to App

Currently `ProjectTab` renders `<App />` with no props, so it starts at `/` and shows ProjectList.

**Change:** Pass `initialPath={/local-projects/${tab.projectId}/tasks}` to `<App />`. This makes the tab open directly to the project's task board.

#### 4. MachineProjectsTab View B removal cleanup

Since View B is removed, we no longer need:
- The `activeProjectId` useState
- The conditional rendering block for View B
- The "Back to projects" button in MachineProjectsTab

The `ProjectListView` component's `onSelectProject` prop becomes `onOpenProject` and calls `openProjectTab` directly.

### What stays the same

- All existing page components (`ProjectList`, `ProjectDetail`, `ProjectTasks`) are preserved with full functionality
- The old `ProjectList` with its dropdown menus, create project, order projects, etc. remains accessible via routes inside `MemoryRouter`
- The `NormalLayout` with Navbar, terminal drawer, etc. continues to work inside each tab
- Tab persistence in localStorage is unchanged
- Connection store's `openProjectTab` / `openMachineProjectsTab` logic is unchanged

### Files to modify

1. **`frontend/src/App.tsx`** — Add `initialPath` prop, conditionally use `MemoryRouter`
2. **`frontend/src/components/tabs/MachineProjectsTab.tsx`** — Remove View B, change click handler to `openProjectTab`
3. **`frontend/src/components/tabs/ProjectTab.tsx`** — Pass `initialPath` to `<App />`

### Edge cases

- **Deep linking:** With `MemoryRouter`, browser URL no longer reflects tab state. This is acceptable because the tab system already manages state via localStorage, and deep links to specific tasks/attempts are primarily used within the same tab.
- **Browser back/forward:** Within a `MemoryRouter`, in-tab back/forward navigation still works via React Router's `useNavigate(-1)`. Browser-level back/forward will not affect tab-internal routing.
- **ProjectCard click inside App:** `ProjectCard` navigates to `/local-projects/${id}/tasks` via React Router — this still works correctly within `MemoryRouter`, navigating within the same tab.
