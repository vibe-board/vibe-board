# Enhanced Connection Manager Design

## Problem

Two issues with the current Tauri desktop app connection manager:

1. **Signout bug:** After clicking signout in E2EE gateway mode, the user is stuck on the login screen with no way to modify the gateway URL. The `logout()` function sets `phase: 'login'`, but `TauriConnectionSetup` (which allows URL editing) only appears when no URL is stored in localStorage.

2. **No multi-connection support:** The app can only connect to one gateway/machine at a time. Users need to manage multiple gateways, machines, and projects simultaneously with quick switching.

## Solution

Replace the single-connection `GatewayContext` with a multi-connection `ConnectionStore` and a tabbed UI. A fixed Home tab provides a tree-view overview of all connections (Gateway -> Machine -> Project), and project-level tabs allow fast switching between different projects across any gateway/machine/direct connection.

## Architecture

### ConnectionStore

Central state manager replacing the single `GatewayContext`:

```
ConnectionStore
  connections: ConnectionEntry[]
  tabs: Tab[]
  activeTabId: string
```

### Unified Connection Interface

A single `UnifiedConnection` interface abstracts over both direct and gateway connections. All consuming code (App components, hooks, etc.) uses this interface — zero branching on connection type.

```typescript
type ConnectionStatus =
  | 'disconnected'
  | 'authenticating'
  | 'authenticated'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// Minimal WebSocket-like interface returned by openWs().
// DirectConnection returns a native WebSocket; GatewayMachineConnection returns RemoteWs.
// Consumers use onmessage/send/close — the common subset.
interface WebSocketLike {
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string): void;
  close(): void;
}

interface UnifiedConnection {
  readonly id: string;
  readonly status: ConnectionStatus;
  readonly label: string;
  readonly queryClient: QueryClient;

  fetch(path: string, init?: RequestInit): Promise<Response>;
  openWs(path: string, query?: string): WebSocketLike;
  listProjects(): Promise<Workspace[]>;
  connect(): Promise<void>;
  disconnect(): void;
}
```

Two internal implementations:

- **`DirectConnection`** — `fetch()` delegates to `window.fetch(url + path)`, `openWs()` creates a native WebSocket, `connect()` tests reachability via `GET /api/config/info`.
- **`GatewayMachineConnection`** — `fetch()` delegates to `E2EEConnection.remoteFetch()`, `openWs()` delegates to `E2EEConnection.openWsStream()`, `connect()` establishes E2EE WebSocket + DEK exchange.

### Connectivity Tree

Two node types feed the Home tab overview:

- **`GatewayNode`** — holds URL, session, machine list. Manages authentication. Creates `GatewayMachineConnection` instances on demand per machine.
- **`DirectNode`** — holds URL. Is itself a `DirectConnection`.

```
ConnectionStore
  nodes: (GatewayNode | DirectNode)[]
    GatewayNode
      machines -> GatewayMachineConnection (created on demand)
    DirectNode
      -> DirectConnection
  tabs: Tab[]
    each tab holds a UnifiedConnection reference
```

## Data Model

### ConnectionEntry (persisted)

```typescript
interface ConnectionEntry {
  id: string;                          // uuid
  type: 'gateway' | 'direct';
  url: string;
  label?: string;                      // user-friendly name

  // Gateway runtime (not persisted)
  session?: GatewaySession;
  machines: MachineStatus[];

  // Runtime
  status: ConnectionStatus;
  error?: string;
}
```

### Tab

```typescript
interface Tab {
  id: string;                          // uuid
  type: 'home' | 'project';
  connectionId?: string;
  machineId?: string;                  // for gateway connections
  projectId?: string;
  label: string;
}
```

### ConnectionStore interface

```typescript
interface ConnectionStore {
  connections: ConnectionEntry[];
  tabs: Tab[];
  activeTabId: string;                 // starts as 'home'

  // Connection CRUD
  addConnection(type, url): string;
  removeConnection(id): void;
  updateConnectionUrl(id, url): void;

  // Auth (gateway)
  loginConnection(id, email, password): Promise<void>;
  logoutConnection(id): void;

  // Machine
  selectMachine(connectionId, machineId): Promise<void>;

  // Tabs
  openProjectTab(connectionId, machineId?, projectId, label): void;
  closeTab(tabId): void;
  setActiveTab(tabId): void;
}
```

## Persistence

All keys use `vb_` prefix:

| Key | Scope | Content |
|-----|-------|---------|
| `vb_connections` | localStorage | `ConnectionEntry[]` (id, type, url, label only) |
| `vb_gateway_session_<connId>` | localStorage | Session token + userId per gateway |
| `vb_e2ee_machine_secrets` | localStorage | Master secrets keyed by machineId |
| `vb_tabs` | localStorage | Tab list (restored on app restart) |
| `vb_active_tab` | sessionStorage | Active tab id (per-window) |

### Migration from old keys

On first load, migrate old `vk_*` keys to `vb_*` equivalents:

- `vk_gateway_session` -> `vb_gateway_session_<auto-generated-connId>`
- `vk_e2ee_machine_secrets` -> `vb_e2ee_machine_secrets`
- `vb-backend-url` / `vb-gateway-url` -> create corresponding `ConnectionEntry` in `vb_connections`

Delete old keys after migration.

## UI

### Tab Bar

Located at the top of the window:

```
+----------+-------------------+-------------------+-----+
| Home     | ProjectX @ MachA  | ProjectY @ MachB  |  +  |
| (fixed)  |              x    |              x    |     |
+----------+-------------------+-------------------+-----+
```

- Home tab: always first, not closable, not draggable
- Project tabs: show `projectName @ machineName` (gateway) or `projectName` / `projectName @ hostname` (direct)
- Each project tab has a close button
- `+` button switches to Home tab
- Project tabs are drag-reorderable
- Active tab is visually highlighted

**Tab label format:**
- Direct (single connection): `ProjectName`
- Direct (multiple connections): `ProjectName @ hostname`
- Gateway: `ProjectName @ MachineName`
- Truncate long labels with tooltip for full path

### Home Tab (Overview Tree)

```
+---------------------------------------------+
|  Connections                    [+ Add]      |
|                                              |
|  > gateway.example.com (E2EE)    [menu]     |
|    user@email.com                [Sign out]  |
|    > Machine-A (online)                      |
|      Project Alpha               [-> open]   |
|      Project Beta                [-> open]   |
|    > Machine-B (offline)                     |
|                                              |
|  > localhost:3001 (Direct)       [menu]      |
|    My Local Project              [-> open]   |
|                                              |
|  > gateway2.example.com (E2EE)   [menu]     |
|    Not logged in                 [Log in]    |
+---------------------------------------------+
```

- `[+ Add]` opens an inline form (reuses direct/gateway selection logic from existing `TauriConnectionSetupForm`)
- `[menu]` per connection: Edit URL, Disconnect, Remove
- Gateway nodes expand to show login state, machine list
- Machine nodes expand to show project list (fetched via `UnifiedConnection.listProjects()`)
- Click `[-> open]` or double-click a project to open it in a new tab
- Offline machines shown collapsed, not expandable

### Signout fix

Naturally resolved by the new architecture. After signout on a gateway node:
- The node shows "Not logged in [Log in]"
- The connection entry remains visible with its URL
- User can log in again, edit the URL, or remove the connection
- All project tabs under that gateway are automatically closed (session invalidated)

## Project Tab Rendering

Each project tab renders the existing App component, injected with the correct connection context:

```tsx
function ProjectTab({ tab }: { tab: Tab }) {
  const conn = useConnection(tab.connectionId);
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <App projectId={tab.projectId} />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
```

Existing components call `useConnection().fetch(path)` instead of branching on direct vs gateway. This is backwards-compatible — `ConnectionProvider` exposes the same interface that current code expects.

## Connection Lifecycle

### Direct

```
[Add URL] -> connected (test GET /api/config/info)
                |
          [open project tab] -> tab uses DirectConnection.fetch()
```

### Gateway

```
[Add URL] -> disconnected
                |
          [Log in] -> authenticating -> authenticated (machine list visible)
                                              |
                                    [open project tab for Machine-A]
                                              |
                                    E2EE WebSocket + DEK exchange -> connected
                                              |
                                    tab uses GatewayMachineConnection.fetch()
```

### Lazy connection

E2EE WebSocket is only established when the first project tab for a machine is opened. Multiple project tabs on the same machine share one `GatewayMachineConnection` instance (reference counted).

When the last tab for a machine closes, delay 30s before disconnecting (in case user reopens quickly).

### Project list fetching

When expanding a machine node in the Home tab tree, if no E2EE connection exists yet, a temporary connection is established to call `listProjects()`.

## Error Handling & Reconnection

### Reconnection (built into UnifiedConnection)

- Exponential backoff: 1s, 2s, 4s, 8s, 8s (max 5 attempts)
- During reconnection: `status = 'reconnecting'`, tab shows "Reconnecting..." banner
- All attempts exhausted: `status = 'error'`, tab shows error state + "Retry" button

### Connection deletion cascade

| Event | Effect |
|-------|--------|
| Connection removed by user | All project tabs under it auto-close |
| Gateway signout | All project tabs under that gateway auto-close |
| Machine goes offline | Tabs show "Machine offline, waiting..." — not auto-closed |

### Tab deduplication

Opening a project that already has a tab activates the existing tab instead of creating a duplicate.

## Tab Interactions

| Action | Trigger |
|--------|---------|
| Switch tab | Click tab / `Ctrl+1~9` |
| Close tab | Click `x` / `Ctrl+W` (Home tab exempt) |
| Open project | Click open button or double-click in Home tab tree |
| `+` button | Switch to Home tab |
| Reorder tabs | Drag project tabs (Home tab fixed at position 0) |

### Tab persistence

On app restart, restore previous tab list from `vb_tabs`. For gateway tabs: if session is still valid and machine is online, auto-reconnect. Otherwise show reconnecting/error state.
