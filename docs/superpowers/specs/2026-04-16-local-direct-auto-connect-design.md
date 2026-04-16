# Local Direct Auto-Connect Design

## Problem

When the frontend is started in local direct mode (alongside a local backend), users must manually add a Direct connection by entering the backend URL (e.g., `http://localhost:3001`). This is unnecessary friction — the frontend should automatically connect to the co-located backend without user intervention.

## Context

The app supports multiple build/deployment modes:

- **Local Direct**: Frontend served by Vite dev server (dev) or embedded in the Rust binary (prod). Backend is always on the same origin or proxied.
- **Gateway/E2EE**: Frontend connects to remote machines through an encrypted gateway.
- **Tauri**: Desktop app wrapping the frontend, supporting both direct and gateway connections.

Currently, all modes share the same multi-connection architecture (`connection-store`), requiring manual connection setup even when the backend is right there.

## Design

### Build Mode Flag

Use a Vite compile-time environment variable `VITE_APP_MODE` to distinguish build modes (using `VITE_APP_MODE` instead of `VITE_APP_MODE` to avoid conflict with Vite's built-in `import.meta.env.MODE`):

| Value | Scenario | Behavior |
|---|---|---|
| `local-direct` | `pnpm run dev`, npx standalone | Auto-connect, no connection management UI |
| (unset or other) | Gateway, Tauri | Full multi-connection UI (current behavior) |

### New: `LocalConnection` Class

File: `frontend/src/lib/connections/localConnection.ts`

Implements `UnifiedConnection` interface with same-origin requests:

- **`fetch(path, init?)`**: Calls `window.fetch(path, init)` — no URL prefix. In dev mode, Vite proxy forwards `/api/*` to the backend. In production, same-origin.
- **`openWs(path, query?)`**: Constructs WebSocket URL from `location.host` using the appropriate protocol (`ws:` / `wss:`).
- **`connect()`**: Sends `GET /api/config/info` to verify the backend is reachable.
- **`listProjects()`**: Sends `GET /api/projects`.
- **`queryClient`**: Own QueryClient instance (same config as DirectConnection).
- **`type`**: `'direct'` (satisfies the interface, no downstream changes needed).
- **`url`**: Empty string (all requests use relative paths).
- **`id`**: Fixed value like `'local'`.
- **`label`**: `'Local Server'`.

### TabShell Branching

`TabShell` checks `import.meta.env.VITE_APP_MODE` at render time:

**When `VITE_APP_MODE === 'local-direct'`:**

1. Creates a `LocalConnection` singleton (via `useRef` or module-level).
2. Calls `connect()` on mount.
3. While connecting: shows a loading spinner.
4. On connection error: shows error message + retry button.
5. On connected: wraps children with `ConnectionProvider` + `QueryClientProvider`, renders:
   - A project list view (extracted from `MachineProjectsTab`'s `ProjectListView`) as the default view.
   - Project tabs that open when user clicks a project.
   - Tab bar without the Home tab and "+" button (no need to add connections).

**When `VITE_APP_MODE` is unset or other value:**

- Behavior is identical to the current implementation. No changes.

### Extract `ProjectListView`

Currently `ProjectListView` is a private component inside `MachineProjectsTab.tsx`. Extract it into its own file (`components/tabs/ProjectListView.tsx`) so both `MachineProjectsTab` and the local-direct mode's default view can reuse it.

The extracted component needs:
- A `UnifiedConnection` (from `useConnection()` context) to call `listProjects()`.
- A callback to open a project tab.

### Tab Management in Local Direct Mode

Local direct mode needs lightweight tab management (no connectionId/machineId complexity):

- Default view: project list (always accessible, replaces HomeTab).
- Open project tabs: clicking a project opens a `ProjectTab`.
- Close project tabs: X button or Ctrl+W.
- Tab state: simple `useState` or a minimal zustand store tracking `{id, projectId, label}[]` + `activeTabId`. No persistence to localStorage needed (or optionally persist just the tab list).

The existing `ProjectTab` component can be reused with minor adaptation — instead of looking up connection from `connection-store`, it reads from `ConnectionProvider` context (which wraps the entire app in local-direct mode).

### Dev Script Changes

In `package.json`, the `dev` script sets `VITE_APP_MODE=local-direct`:

```
export VITE_APP_MODE=local-direct && \
export FRONTEND_PORT=... && \
export BACKEND_PORT=... && \
...
```

The npx/production build script for local direct also sets this variable.

### No Code Deleted

All existing code is preserved:
- `connection-store.ts` — used by gateway/tauri modes
- `HomeTab.tsx`, `AddConnectionForm.tsx` — used by gateway/tauri modes
- `DirectConnection.ts` — used by existing multi-connection Direct mode
- `gatewayConnection.ts`, `gatewayNode.ts` — used by gateway mode
- `ActiveConnectionBridge.tsx` — used by gateway mode

The local-direct code path simply doesn't import or use them (tree-shaking removes them from the local-direct bundle).

## Files Changed

| File | Change |
|---|---|
| `frontend/src/lib/connections/localConnection.ts` | **New** — `LocalConnection` class |
| `frontend/src/components/tabs/ProjectListView.tsx` | **New** — extracted from `MachineProjectsTab` |
| `frontend/src/components/tabs/TabShell.tsx` | **Modified** — branch on `VITE_APP_MODE`, add local-direct path |
| `frontend/src/components/tabs/TabBar.tsx` | **Modified** — conditional: hide Home tab and "+" in local-direct mode |
| `frontend/src/components/tabs/ProjectTab.tsx` | **Modified** — support getting connection from context (for local-direct mode) |
| `frontend/src/components/tabs/MachineProjectsTab.tsx` | **Modified** — use extracted `ProjectListView` |
| `package.json` | **Modified** — add `VITE_APP_MODE=local-direct` to `dev` script |

## Out of Scope

- Changing the Gateway/Tauri connection flow.
- Adding service discovery or mDNS for finding local servers.
- Modifying the Rust backend.
