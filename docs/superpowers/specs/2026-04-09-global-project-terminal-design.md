# Global Terminal & Project Terminal

## Problem

Currently, opening a terminal requires first creating a task and starting an attempt — the terminal's working directory is tied to the task's workspace (worktree). Users need a way to open a terminal without this task dependency:

1. **Global Terminal**: Working directory is the user's home directory. Accessible from any page.
2. **Project Terminal**: Working directory is the project's repo directory. Accessible from the project tasks page.

## Approach

**New backend endpoint** (`/api/terminal/direct-ws`) that accepts a `cwd` parameter directly, bypassing workspace lookup. This is separate from the existing `/api/terminal/ws` endpoint to keep concerns clean and avoid modifying task-terminal code.

**Navbar buttons** in the top navigation bar to toggle a right-side terminal drawer panel.

## Architecture

### Backend

#### New WebSocket Endpoint: `GET /api/terminal/direct-ws`

Query parameters:

| Parameter    | Type         | Required | Default | Description                     |
|-------------|-------------|----------|---------|----------------------------------|
| `cwd`       | `String`    | yes      | —       | Absolute path for working dir    |
| `session_id`| `Uuid`      | no       | —       | Reconnect to existing PTY session|
| `cols`      | `u16`       | no       | 80      | Terminal columns                 |
| `rows`      | `u16`       | no       | 24      | Terminal rows                    |

Validation:
- `cwd` must be an absolute path
- `cwd` must not contain `..` segments
- `cwd` must exist and be a directory on the filesystem

After validation, delegates to the existing `handle_terminal_ws()` function which only needs a `PathBuf` working directory — all PTY session management, WebSocket message protocol, reconnection, and cleanup are fully reused.

Route registration: add to the existing terminal router in `crates/server/src/routes/terminal.rs`.

#### New REST Endpoint: `GET /api/system/home-dir`

Returns the server's home directory path as JSON. This is needed because:
- In gateway mode, the server may be on a remote machine with a different home directory
- The frontend cannot assume `$HOME`

Response: `{ "home_dir": "/home/username" }`

#### Project Repo Path (no new endpoint)

The frontend already has a `useProjectRepos` hook that returns repos with their `path` field. No new endpoint needed — the frontend derives the project's first repo path from existing data.

### Frontend

#### XTermInstance Changes

Currently, `XTermInstance` builds the WebSocket URL internally using `workspaceId`:

```typescript
const endpoint = `ws://.../api/terminal/ws?workspace_id=${workspaceId}&...`;
```

Change: Accept an `endpointUrl` prop (the full WebSocket URL) instead of `workspaceId`. The parent component is responsible for constructing the correct URL based on whether it's a workspace terminal or a direct terminal.

For backward compatibility with existing task terminals, `TerminalPanel` will construct the workspace-based URL and pass it to `XTermInstance`.

#### TerminalContext Changes

Extend the context to support "direct terminals" using virtual workspace IDs:

- Global terminal: `workspaceId = "global-terminal"`, `taskId = "global"`
- Project terminal: `workspaceId = "project-terminal:{projectId}"`, `taskId = "project:{projectId}"`

No schema changes needed — these are just string conventions. The existing tab management (create, close, persist to localStorage) works unchanged.

#### Navbar Button

Add a terminal icon button (`SquareTerminal` from lucide-react) in the Navbar's right button group:

- **When no projectId**: Button opens global terminal (home directory)
- **When projectId is present**: Button opens project terminal (first repo's path)
- Button toggles the terminal drawer open/closed
- Active state indicator when drawer is open

#### Terminal Drawer (new component)

A right-side resizable drawer panel rendered in `NormalLayout`:

- Uses `react-resizable-panels` for drag-to-resize width
- Renders `TerminalPanel` with the virtual workspaceId and cwd
- Pushes the main content area to the left (flex layout, not overlay)
- Persists open/closed state to localStorage
- The drawer is always mounted once opened (hidden via CSS when closed) to preserve terminal state and WebSocket connections

The drawer is a sibling of the `<Outlet>` in `NormalLayout`, positioned as a flex row:

```
┌─────────────────────────────────────────────┐
│ Navbar  [... buttons ...]  [Terminal btn]   │
├──────────────────────────┬──────────────────┤
│                          │                  │
│  Main Content (Outlet)   │  Terminal Drawer │
│                          │  (resizable)     │
│                          │                  │
├──────────────────────────┴──────────────────┤
```

#### Tasks Page Integration

On the tasks page (`ProjectTasks`), clicking the Navbar terminal button opens the same drawer — it sits in `NormalLayout` which wraps all pages including the tasks route. The project terminal in the drawer is independent from the task-specific terminal in the aux panel.

### State Management

A new `TerminalDrawerContext` (separate from the existing `TerminalContext`) to manage drawer-specific state:

- `isDrawerOpen: boolean` — whether the drawer is visible
- `drawerCwd: string | null` — the working directory for the drawer terminal
- `drawerWorkspaceId: string` — the virtual workspace ID
- `toggleDrawer(cwd: string, workspaceId: string): void` — open/close the drawer
- `closeDrawer(): void` — close the drawer

This context is provided at the `NormalLayout` level so the Navbar button and the drawer component can communicate. The existing `TerminalContext` (which manages tabs and PTY sessions) is reused as-is.

### Data Flow

```
User clicks Navbar terminal button
  → Determine cwd:
    - No projectId: fetch home dir from /api/system/home-dir (cached)
    - Has projectId: use first repo's path from useProjectRepos
  → Toggle TerminalDrawer open
  → TerminalDrawer renders TerminalPanel with virtual workspaceId + cwd
  → TerminalPanel auto-creates first tab via TerminalContext
  → XTermInstance connects to /api/terminal/direct-ws?cwd=...
  → Backend validates cwd, creates PTY session
  → Normal terminal I/O over WebSocket
```

## Files to Modify

### Backend (Rust)
- `crates/server/src/routes/terminal.rs` — add `direct_terminal_ws` handler and `DirectTerminalQuery` struct, register new route
- `crates/server/src/routes/mod.rs` — add system home-dir route (or new `system.rs` if needed)

### Frontend (TypeScript/React)
- `frontend/src/components/panels/XTermInstance.tsx` — accept `endpointUrl` prop instead of `workspaceId`
- `frontend/src/components/panels/TerminalPanel.tsx` — construct endpoint URL and pass to XTermInstance
- `frontend/src/components/layout/Navbar.tsx` — add terminal button
- `frontend/src/components/layout/NormalLayout.tsx` — add terminal drawer
- `frontend/src/contexts/TerminalDrawerContext.tsx` — new context for drawer state
- `frontend/src/lib/api.ts` — add `getHomeDir()` API call
- `frontend/src/hooks/useHomeDir.ts` — new hook wrapping the API call

## Edge Cases

- **Home dir API failure**: Show error toast, don't open terminal
- **Project with no repos**: Disable project terminal button or fall back to home dir
- **Gateway mode**: The `direct-ws` endpoint works the same — cwd is validated on the server side. Home dir API returns the remote machine's home dir.
- **Multiple project repos**: Use the first repo's path (same convention as existing "Open in IDE" button)
- **Drawer resize persistence**: Save panel size to localStorage via react-resizable-panels' built-in storage

## Out of Scope

- Terminal tabs across different working directories in the same drawer (could be added later)
- Keyboard shortcuts to toggle the drawer
- Terminal search/find functionality
