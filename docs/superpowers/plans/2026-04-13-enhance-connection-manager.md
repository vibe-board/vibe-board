# Enhanced Connection Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-connection GatewayContext with a multi-connection ConnectionStore and tabbed UI, fixing the signout bug and enabling simultaneous management of multiple gateways/machines/projects.

**Architecture:** Introduce a `UnifiedConnection` interface with two implementations (`DirectConnection`, `GatewayMachineConnection`) that abstract away direct vs E2EE gateway differences. A Zustand-based `ConnectionStore` manages multiple connections and tabs. The UI adds a tab bar at the top and a Home tab with a tree-view of all connections. Existing app components consume `useConnection().fetch()` instead of branching on connection type.

**Tech Stack:** React 18, TypeScript, Zustand (state management), TanStack React Query, existing E2EE library (`lib/e2ee/*`), Tailwind CSS (legacy design system)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `frontend/src/lib/connections/types.ts` | Shared types: `ConnectionStatus`, `WebSocketLike`, `UnifiedConnection`, `ConnectionEntry`, `Tab` |
| `frontend/src/lib/connections/direct-connection.ts` | `DirectConnection` implements `UnifiedConnection` for local backends |
| `frontend/src/lib/connections/gateway-connection.ts` | `GatewayMachineConnection` implements `UnifiedConnection` for E2EE gateway machines |
| `frontend/src/lib/connections/gateway-node.ts` | `GatewayNode` — manages gateway auth, machine list WS, creates `GatewayMachineConnection` on demand |
| `frontend/src/lib/connections/index.ts` | Barrel exports |
| `frontend/src/stores/connection-store.ts` | Zustand store: connections, tabs, active tab, CRUD actions, persistence |
| `frontend/src/stores/migration.ts` | One-time migration from old `vk_*`/`vb-*` localStorage keys to new `vb_*` format |
| `frontend/src/contexts/ConnectionContext.tsx` | `ConnectionProvider` + `useConnection()` hook — injects `UnifiedConnection` into React tree |
| `frontend/src/components/tabs/TabBar.tsx` | Tab bar UI component (Home tab + project tabs + close/add buttons) |
| `frontend/src/components/tabs/HomeTab.tsx` | Home tab: tree view of connections, login forms, project list |
| `frontend/src/components/tabs/ProjectTab.tsx` | Project tab wrapper: provides connection context + QueryClient to existing App |
| `frontend/src/components/tabs/TabShell.tsx` | Top-level shell: renders TabBar + active tab content |
| `frontend/src/components/tabs/AddConnectionForm.tsx` | Inline form for adding new direct/gateway connections (extracted from TauriConnectionSetupForm) |

### Modified files

| File | Changes |
|------|---------|
| `frontend/src/main.tsx` | Replace `GatewayProvider` + `GatewayGate` with `TabShell` as the top-level wrapper |
| `frontend/src/lib/api.ts` | Replace `makeRequest`'s gateway branching with `useConnection().fetch()` pattern; export a `setActiveConnection` for non-React code |
| `frontend/src/lib/gatewayMode.ts` | Adapt to work with multi-connection: `getGatewayConnection()` reads from active connection |
| `frontend/src/lib/e2ee/manager.ts` | Rename `vk_e2ee_machine_secrets` → `vb_e2ee_machine_secrets` storage key |
| `frontend/src/hooks/useLogStream.ts` | Replace `getGatewayConnection()`/`getWsBaseUrl()` branching with `useConnection().openWs()` |
| `frontend/src/hooks/useJsonPatchWsStream.ts` | Same as useLogStream — use `useConnection().openWs()` |
| `frontend/src/utils/streamJsonPatchEntries.ts` | Same — use connection's `openWs()` |
| `frontend/src/components/panels/XTermInstance.tsx` | Same — use connection's `openWs()` and `fetch()` |
| `frontend/src/components/layout/Navbar.tsx` | Remove gateway machine display/switching; show current tab's connection info instead |

### Files to remove (after migration)

| File | Reason |
|------|--------|
| `frontend/src/contexts/GatewayContext.tsx` | Replaced by ConnectionStore + ConnectionContext |
| `frontend/src/components/gateway/GatewayGate.tsx` | Replaced by TabShell |
| `frontend/src/components/gateway/GatewayLoginPage.tsx` | Inlined into HomeTab gateway node UI |
| `frontend/src/components/gateway/GatewayMachineSelectPage.tsx` | Inlined into HomeTab gateway node UI |

---

## Task 1: Shared Types

**Files:**
- Create: `frontend/src/lib/connections/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// frontend/src/lib/connections/types.ts
import type { QueryClient } from '@tanstack/react-query';

export type ConnectionStatus =
  | 'disconnected'
  | 'authenticating'
  | 'authenticated'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WebSocketLike {
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string): void;
  close(): void;
  readonly readyState: number;
}

export interface UnifiedConnection {
  readonly id: string;
  readonly type: 'direct' | 'gateway';
  readonly url: string;
  readonly label: string;
  readonly queryClient: QueryClient;

  status: ConnectionStatus;
  error: string | null;

  fetch(path: string, init?: RequestInit, extra?: { timeoutMs?: number }): Promise<Response>;
  openWs(path: string, query?: string): WebSocketLike;
  listProjects(): Promise<Project[]>;
  connect(): Promise<void>;
  disconnect(): void;

  /** Subscribe to status changes */
  onStatusChange(cb: (status: ConnectionStatus, error: string | null) => void): () => void;
}

export interface Project {
  id: string;
  name: string;
  path?: string;
}

export interface GatewaySession {
  sessionToken: string;
  userId: string;
}

export interface ConnectionEntryPersisted {
  id: string;
  type: 'gateway' | 'direct';
  url: string;
  label?: string;
}

export interface TabPersisted {
  id: string;
  type: 'home' | 'project';
  connectionId?: string;
  machineId?: string;
  projectId?: string;
  label: string;
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// frontend/src/lib/connections/index.ts
export * from './types';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No errors related to the new files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/connections/types.ts frontend/src/lib/connections/index.ts
git commit -m "feat(connections): add shared types for unified connection interface"
```

---

## Task 2: DirectConnection

**Files:**
- Create: `frontend/src/lib/connections/direct-connection.ts`
- Modify: `frontend/src/lib/connections/index.ts`

- [ ] **Step 1: Implement DirectConnection**

```typescript
// frontend/src/lib/connections/direct-connection.ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
import type {
  UnifiedConnection,
  ConnectionStatus,
  WebSocketLike,
  Project,
} from './types';

export class DirectConnection implements UnifiedConnection {
  readonly type = 'direct' as const;
  readonly queryClient: QueryClient;

  status: ConnectionStatus = 'disconnected';
  error: string | null = null;

  private statusListeners = new Set<(status: ConnectionStatus, error: string | null) => void>();

  constructor(
    readonly id: string,
    readonly url: string,
    readonly label: string,
  ) {
    this.queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          console.error('[DirectConnection QueryError]', { queryKey: query.queryKey, error });
        },
      }),
      defaultOptions: {
        queries: { staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false },
      },
    });
  }

  private setStatus(status: ConnectionStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((cb) => cb(status, error));
  }

  onStatusChange(cb: (status: ConnectionStatus, error: string | null) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      const resp = await window.fetch(`${this.url}/api/config/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      this.setStatus('connected');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      this.setStatus('error', msg);
      throw e;
    }
  }

  disconnect(): void {
    this.setStatus('disconnected');
  }

  async fetch(path: string, init?: RequestInit, extra?: { timeoutMs?: number }): Promise<Response> {
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return window.fetch(`${this.url}${path}`, { ...init, headers });
  }

  openWs(path: string, query?: string): WebSocketLike {
    const wsUrl = this.url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const fullPath = query ? `${path}?${query}` : path;
    return new WebSocket(`${wsUrl}${fullPath}`) as unknown as WebSocketLike;
  }

  async listProjects(): Promise<Project[]> {
    const resp = await this.fetch('/api/projects');
    if (!resp.ok) throw new Error(`Failed to list projects: ${resp.status}`);
    const data = await resp.json();
    return (data as Array<{ id: string; name: string; path?: string }>).map((p) => ({
      id: String(p.id),
      name: p.name,
      path: p.path,
    }));
  }
}
```

- [ ] **Step 2: Add to barrel export**

Add to `frontend/src/lib/connections/index.ts`:

```typescript
export { DirectConnection } from './direct-connection';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/connections/direct-connection.ts frontend/src/lib/connections/index.ts
git commit -m "feat(connections): implement DirectConnection"
```

---

## Task 3: GatewayMachineConnection

**Files:**
- Create: `frontend/src/lib/connections/gateway-connection.ts`
- Modify: `frontend/src/lib/connections/index.ts`

- [ ] **Step 1: Implement GatewayMachineConnection**

```typescript
// frontend/src/lib/connections/gateway-connection.ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
import { E2EEConnection } from '@/lib/e2ee';
import type {
  UnifiedConnection,
  ConnectionStatus,
  WebSocketLike,
  Project,
  GatewaySession,
} from './types';

export class GatewayMachineConnection implements UnifiedConnection {
  readonly type = 'gateway' as const;
  readonly queryClient: QueryClient;

  status: ConnectionStatus = 'disconnected';
  error: string | null = null;

  private e2eeConn: E2EEConnection | null = null;
  private statusListeners = new Set<(status: ConnectionStatus, error: string | null) => void>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private refCount = 0;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly id: string,
    readonly url: string,
    readonly label: string,
    private gatewayUrl: string,
    private session: GatewaySession,
    private machineId: string,
  ) {
    this.queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          console.error('[GatewayMachineConnection QueryError]', { queryKey: query.queryKey, error });
        },
      }),
      defaultOptions: {
        queries: { staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false },
      },
    });
  }

  /** Increment ref count — called when a tab opens on this machine */
  addRef(): void {
    this.refCount++;
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  /** Decrement ref count — called when a tab closes. Disconnects after 30s if refCount reaches 0. */
  removeRef(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.status === 'connected') {
      this.disconnectTimer = setTimeout(() => {
        if (this.refCount === 0) this.disconnect();
      }, 30_000);
    }
  }

  private setStatus(status: ConnectionStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((cb) => cb(status, error));
  }

  onStatusChange(cb: (status: ConnectionStatus, error: string | null) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async connect(): Promise<void> {
    if (this.status === 'connected' && this.e2eeConn) return;
    this.setStatus('connecting');
    this.reconnectAttempts = 0;

    try {
      await this.doConnect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      this.setStatus('error', msg);
      throw e;
    }
  }

  private async doConnect(): Promise<void> {
    const conn = new E2EEConnection();
    await conn.connect({
      gatewayUrl: this.gatewayUrl,
      sessionToken: this.session.sessionToken,
      machineId: this.machineId,
      onConnect: () => {
        this.reconnectAttempts = 0;
      },
      onDisconnect: () => {
        this.e2eeConn = null;
        this.attemptReconnect();
      },
      onError: (err) => {
        this.setStatus('error', err);
      },
    });
    conn.subscribeMachine(this.machineId);
    await conn.initDek();
    this.e2eeConn = conn;
    this.setStatus('connected');
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= 5) {
      this.setStatus('error', 'Connection lost');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(8000, 1000 * Math.pow(2, this.reconnectAttempts - 1));
    this.setStatus('reconnecting', `Reconnecting... (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.doConnect();
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    if (this.e2eeConn) {
      this.e2eeConn.disconnect();
      this.e2eeConn = null;
    }
    this.setStatus('disconnected');
  }

  async fetch(path: string, init?: RequestInit, extra?: { timeoutMs?: number }): Promise<Response> {
    if (!this.e2eeConn) throw new Error('Not connected');
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return this.e2eeConn.remoteFetch(path, { ...init, headers }, extra);
  }

  openWs(path: string, query?: string): WebSocketLike {
    if (!this.e2eeConn) throw new Error('Not connected');
    return this.e2eeConn.openWsStream(path, query) as unknown as WebSocketLike;
  }

  async listProjects(): Promise<Project[]> {
    const resp = await this.fetch('/api/projects');
    if (!resp.ok) throw new Error(`Failed to list projects: ${resp.status}`);
    const data = await resp.json();
    return (data as Array<{ id: string; name: string; path?: string }>).map((p) => ({
      id: String(p.id),
      name: p.name,
      path: p.path,
    }));
  }

  /** Update session token (e.g. after re-login) */
  updateSession(session: GatewaySession): void {
    this.session = session;
  }

  /** Expose the raw E2EE connection for edge cases */
  get rawConnection(): E2EEConnection | null {
    return this.e2eeConn;
  }
}
```

- [ ] **Step 2: Add to barrel export**

Add to `frontend/src/lib/connections/index.ts`:

```typescript
export { GatewayMachineConnection } from './gateway-connection';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/connections/gateway-connection.ts frontend/src/lib/connections/index.ts
git commit -m "feat(connections): implement GatewayMachineConnection with E2EE"
```

---

## Task 4: GatewayNode

**Files:**
- Create: `frontend/src/lib/connections/gateway-node.ts`
- Modify: `frontend/src/lib/connections/index.ts`

- [ ] **Step 1: Implement GatewayNode**

`GatewayNode` manages gateway-level state (auth, machine list WebSocket) and creates `GatewayMachineConnection` instances on demand.

```typescript
// frontend/src/lib/connections/gateway-node.ts
import { E2EEManager, type MachineStatus } from '@/lib/e2ee';
import { GatewayMachineConnection } from './gateway-connection';
import type { GatewaySession } from './types';

export class GatewayNode {
  session: GatewaySession | null = null;
  machines: MachineStatus[] = [];
  registrationOpen: boolean | null = null;
  authError: string | null = null;
  authLoading = false;

  private machineListWs: WebSocket | null = null;
  private machineConnections = new Map<string, GatewayMachineConnection>();
  private listeners = new Set<() => void>();
  private manager = E2EEManager.getInstance();

  constructor(
    readonly connectionId: string,
    readonly gatewayUrl: string,
  ) {}

  /** Subscribe to any state change */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  /** Load session from localStorage */
  loadSession(): void {
    try {
      const raw = localStorage.getItem(`vb_gateway_session_${this.connectionId}`);
      if (raw) this.session = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  /** Save session to localStorage */
  private saveSession(): void {
    if (this.session) {
      localStorage.setItem(
        `vb_gateway_session_${this.connectionId}`,
        JSON.stringify(this.session),
      );
    }
  }

  private clearSession(): void {
    localStorage.removeItem(`vb_gateway_session_${this.connectionId}`);
    this.session = null;
  }

  async login(email: string, password: string): Promise<void> {
    this.authLoading = true;
    this.authError = null;
    this.notify();
    try {
      const resp = await fetch(`${this.gatewayUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Login failed (${resp.status})`);
      }
      const data: { token: string; user_id: string } = await resp.json();
      this.session = { sessionToken: data.token, userId: data.user_id };
      this.saveSession();
      this.startMachineListWs();
    } catch (e) {
      this.authError = e instanceof Error ? e.message : 'Login failed';
    } finally {
      this.authLoading = false;
      this.notify();
    }
  }

  async signup(email: string, password: string, name?: string): Promise<void> {
    this.authLoading = true;
    this.authError = null;
    this.notify();
    try {
      const resp = await fetch(`${this.gatewayUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Signup failed (${resp.status})`);
      }
      const data: { token: string; user_id: string } = await resp.json();
      this.session = { sessionToken: data.token, userId: data.user_id };
      this.saveSession();
      this.startMachineListWs();
    } catch (e) {
      this.authError = e instanceof Error ? e.message : 'Signup failed';
    } finally {
      this.authLoading = false;
      this.notify();
    }
  }

  logout(): void {
    this.stopMachineListWs();
    // Disconnect all machine connections
    for (const conn of this.machineConnections.values()) {
      conn.disconnect();
    }
    this.machineConnections.clear();
    this.clearSession();
    this.machines = [];
    this.notify();
  }

  /** Start listening for machine list updates via WebSocket */
  startMachineListWs(): void {
    if (!this.session || this.machineListWs) return;
    const wsUrl = this.gatewayUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    const connectUrl = `${wsUrl}/ws/webui?token=${encodeURIComponent(this.session.sessionToken)}`;
    const ws = new WebSocket(connectUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'auth_ok') {
          // connected
        } else if (msg.type === 'auth_error') {
          this.clearSession();
          this.machines = [];
          this.notify();
        } else if (msg.type === 'machines') {
          this.machines = msg.machines;
          this.notify();
        } else if (msg.type === 'machine_online') {
          if (!this.machines.find((m) => m.machine_id === msg.machine_id)) {
            this.machines = [...this.machines, {
              machine_id: msg.machine_id,
              hostname: msg.hostname || '',
              platform: msg.platform || '',
              port: msg.port || 0,
            }];
            this.notify();
          }
        } else if (msg.type === 'machine_offline') {
          this.machines = this.machines.filter((m) => m.machine_id !== msg.machine_id);
          this.notify();
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      console.warn('[GatewayNode] Machine list WS error');
    };

    ws.onclose = () => {
      this.machineListWs = null;
    };

    this.machineListWs = ws;
  }

  stopMachineListWs(): void {
    if (this.machineListWs) {
      this.machineListWs.onclose = null;
      this.machineListWs.onmessage = null;
      this.machineListWs.close();
      this.machineListWs = null;
    }
  }

  /** Fetch registration status from gateway */
  async fetchRegistrationStatus(): Promise<void> {
    try {
      const resp = await fetch(`${this.gatewayUrl}/api/auth/registration-status`);
      const data = await resp.json();
      this.registrationOpen = data.open;
    } catch {
      this.registrationOpen = false;
    }
    this.notify();
  }

  /** Get or create a GatewayMachineConnection for a specific machine */
  getMachineConnection(machineId: string): GatewayMachineConnection | null {
    if (!this.session) return null;

    let conn = this.machineConnections.get(machineId);
    if (!conn) {
      const machine = this.machines.find((m) => m.machine_id === machineId);
      const machineLabel = machine?.hostname || machineId.slice(0, 8);
      conn = new GatewayMachineConnection(
        `${this.connectionId}:${machineId}`,
        this.gatewayUrl,
        machineLabel,
        this.gatewayUrl,
        this.session,
        machineId,
      );
      this.machineConnections.set(machineId, conn);
    }
    return conn;
  }

  isMachinePaired(machineId: string): boolean {
    return this.manager.isMachinePaired(machineId);
  }

  pairMachine(machineId: string, base64Secret: string): void {
    this.manager.pairMachine(machineId, base64Secret);
    this.notify();
  }

  unpairMachine(machineId: string): void {
    this.manager.unpairMachine(machineId);
    this.notify();
  }

  /** Cleanup all resources */
  destroy(): void {
    this.stopMachineListWs();
    for (const conn of this.machineConnections.values()) {
      conn.disconnect();
    }
    this.machineConnections.clear();
  }
}
```

- [ ] **Step 2: Add to barrel export**

Add to `frontend/src/lib/connections/index.ts`:

```typescript
export { GatewayNode } from './gateway-node';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/connections/gateway-node.ts frontend/src/lib/connections/index.ts
git commit -m "feat(connections): implement GatewayNode for gateway auth and machine management"
```

---

## Task 5: Storage Migration

**Files:**
- Create: `frontend/src/stores/migration.ts`

- [ ] **Step 1: Implement migration**

```typescript
// frontend/src/stores/migration.ts
import { v4 as uuid } from 'uuid';
import type { ConnectionEntryPersisted, TabPersisted } from '@/lib/connections/types';

const MIGRATION_DONE_KEY = 'vb_migration_v1_done';

/**
 * One-time migration from old vk_*/vb-* localStorage keys to new vb_* format.
 * Creates ConnectionEntry records from old single-connection config.
 */
export function runMigrationIfNeeded(): void {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  const connections: ConnectionEntryPersisted[] = [];

  // Migrate gateway URL
  const oldGatewayUrl = localStorage.getItem('vb-gateway-url');
  if (oldGatewayUrl) {
    const connId = uuid();
    connections.push({ id: connId, type: 'gateway', url: oldGatewayUrl });

    // Migrate session
    const oldSession = localStorage.getItem('vk_gateway_session');
    if (oldSession) {
      localStorage.setItem(`vb_gateway_session_${connId}`, oldSession);
      localStorage.removeItem('vk_gateway_session');
    }

    localStorage.removeItem('vb-gateway-url');
  }

  // Migrate direct backend URL
  const oldBackendUrl = localStorage.getItem('vb-backend-url');
  if (oldBackendUrl) {
    const connId = uuid();
    connections.push({ id: connId, type: 'direct', url: oldBackendUrl });
    localStorage.removeItem('vb-backend-url');
  }

  // Migrate E2EE machine secrets key name
  const oldSecrets = localStorage.getItem('vk_e2ee_machine_secrets');
  if (oldSecrets) {
    localStorage.setItem('vb_e2ee_machine_secrets', oldSecrets);
    localStorage.removeItem('vk_e2ee_machine_secrets');
  }

  // Also clean up the even older key
  localStorage.removeItem('vk_e2ee_secrets');

  // Clean up old selected machine keys
  localStorage.removeItem('vk_gateway_selected_machine');
  localStorage.removeItem('vk_gateway_last_machine');
  sessionStorage.removeItem('vk_gateway_selected_machine');

  // Save migrated connections
  if (connections.length > 0) {
    localStorage.setItem('vb_connections', JSON.stringify(connections));
  }

  localStorage.setItem(MIGRATION_DONE_KEY, '1');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/migration.ts
git commit -m "feat(connections): add localStorage migration from vk_* to vb_* keys"
```

---

## Task 6: ConnectionStore (Zustand)

**Files:**
- Create: `frontend/src/stores/connection-store.ts`

First, check if Zustand is already installed:

- [ ] **Step 1: Install Zustand if needed**

Run: `cd frontend && pnpm list zustand 2>/dev/null || pnpm add zustand`

- [ ] **Step 2: Implement the store**

```typescript
// frontend/src/stores/connection-store.ts
import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { DirectConnection } from '@/lib/connections/direct-connection';
import { GatewayNode } from '@/lib/connections/gateway-node';
import type {
  ConnectionEntryPersisted,
  TabPersisted,
  UnifiedConnection,
  GatewaySession,
} from '@/lib/connections/types';
import type { MachineStatus } from '@/lib/e2ee';
import { runMigrationIfNeeded } from './migration';

// -- Persistence helpers --

function loadConnections(): ConnectionEntryPersisted[] {
  try {
    const raw = localStorage.getItem('vb_connections');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConnections(entries: ConnectionEntryPersisted[]): void {
  localStorage.setItem('vb_connections', JSON.stringify(entries));
}

function loadTabs(): TabPersisted[] {
  try {
    const raw = localStorage.getItem('vb_tabs');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTabs(tabs: TabPersisted[]): void {
  localStorage.setItem('vb_tabs', JSON.stringify(tabs));
}

function loadActiveTab(): string {
  return sessionStorage.getItem('vb_active_tab') || 'home';
}

function saveActiveTab(id: string): void {
  sessionStorage.setItem('vb_active_tab', id);
}

// -- Store types --

interface ConnectionNode {
  entry: ConnectionEntryPersisted;
  // Direct connections
  directConn?: DirectConnection;
  // Gateway connections
  gatewayNode?: GatewayNode;
}

export interface ConnectionStoreState {
  nodes: ConnectionNode[];
  tabs: TabPersisted[];
  activeTabId: string;
  initialized: boolean;
}

export interface ConnectionStoreActions {
  // Init
  init(): void;

  // Connection CRUD
  addConnection(type: 'direct' | 'gateway', url: string, label?: string): string;
  removeConnection(id: string): void;
  updateConnectionUrl(id: string, url: string): void;

  // Gateway auth
  loginConnection(id: string, email: string, password: string): Promise<void>;
  signupConnection(id: string, email: string, password: string, name?: string): Promise<void>;
  logoutConnection(id: string): void;

  // Gateway machine pairing
  pairMachine(connectionId: string, machineId: string, base64Secret: string): void;
  unpairMachine(connectionId: string, machineId: string): void;

  // Get unified connection for a tab
  getConnection(connectionId: string, machineId?: string): UnifiedConnection | null;

  // Tabs
  openProjectTab(connectionId: string, machineId: string | undefined, projectId: string, label: string): void;
  closeTab(tabId: string): void;
  setActiveTab(tabId: string): void;
  reorderTabs(fromIndex: number, toIndex: number): void;

  // Getters
  getNode(connectionId: string): ConnectionNode | undefined;
  getGatewayNode(connectionId: string): GatewayNode | undefined;
  getMachines(connectionId: string): MachineStatus[];
  getSession(connectionId: string): GatewaySession | null;
}

export type ConnectionStore = ConnectionStoreState & ConnectionStoreActions;

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  nodes: [],
  tabs: [],
  activeTabId: 'home',
  initialized: false,

  init() {
    if (get().initialized) return;

    // Run migration first
    runMigrationIfNeeded();

    const entries = loadConnections();
    const nodes: ConnectionNode[] = entries.map((entry) => {
      if (entry.type === 'direct') {
        const conn = new DirectConnection(entry.id, entry.url, entry.label || entry.url);
        // Auto-connect direct connections
        conn.connect().catch(() => {});
        return { entry, directConn: conn };
      } else {
        const node = new GatewayNode(entry.id, entry.url);
        node.loadSession();
        node.fetchRegistrationStatus();
        if (node.session) {
          node.startMachineListWs();
        }
        return { entry, gatewayNode: node };
      }
    });

    const tabs = loadTabs();
    const activeTabId = loadActiveTab();

    set({ nodes, tabs, activeTabId, initialized: true });
  },

  addConnection(type, url, label) {
    const id = uuid();
    const entry: ConnectionEntryPersisted = { id, type, url, label };
    const node: ConnectionNode = { entry };

    if (type === 'direct') {
      const conn = new DirectConnection(id, url, label || url);
      conn.connect().catch(() => {});
      node.directConn = conn;
    } else {
      const gwNode = new GatewayNode(id, url);
      gwNode.fetchRegistrationStatus();
      node.gatewayNode = gwNode;
    }

    set((s) => {
      const nodes = [...s.nodes, node];
      saveConnections(nodes.map((n) => n.entry));
      return { nodes };
    });
    return id;
  },

  removeConnection(id) {
    set((s) => {
      const node = s.nodes.find((n) => n.entry.id === id);
      if (node?.directConn) node.directConn.disconnect();
      if (node?.gatewayNode) node.gatewayNode.destroy();

      // Remove session key
      localStorage.removeItem(`vb_gateway_session_${id}`);

      const nodes = s.nodes.filter((n) => n.entry.id !== id);
      // Close tabs belonging to this connection
      const tabs = s.tabs.filter((t) => t.connectionId !== id);

      saveConnections(nodes.map((n) => n.entry));
      saveTabs(tabs);

      const activeTabId = tabs.find((t) => t.id === s.activeTabId) ? s.activeTabId : 'home';
      saveActiveTab(activeTabId);

      return { nodes, tabs, activeTabId };
    });
  },

  updateConnectionUrl(id, url) {
    set((s) => {
      const nodes = s.nodes.map((n) => {
        if (n.entry.id !== id) return n;
        const entry = { ...n.entry, url };
        // Recreate the node with new URL
        if (n.directConn) n.directConn.disconnect();
        if (n.gatewayNode) n.gatewayNode.destroy();

        if (entry.type === 'direct') {
          const conn = new DirectConnection(id, url, entry.label || url);
          conn.connect().catch(() => {});
          return { entry, directConn: conn };
        } else {
          const gwNode = new GatewayNode(id, url);
          gwNode.fetchRegistrationStatus();
          return { entry, gatewayNode: gwNode };
        }
      });
      saveConnections(nodes.map((n) => n.entry));
      return { nodes };
    });
  },

  async loginConnection(id, email, password) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayNode) return;
    await node.gatewayNode.login(email, password);
    set((s) => ({ nodes: [...s.nodes] })); // trigger re-render
  },

  async signupConnection(id, email, password, name) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayNode) return;
    await node.gatewayNode.signup(email, password, name);
    set((s) => ({ nodes: [...s.nodes] })); // trigger re-render
  },

  logoutConnection(id) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayNode) return;
    node.gatewayNode.logout();

    // Close all tabs belonging to this gateway
    set((s) => {
      const tabs = s.tabs.filter((t) => t.connectionId !== id);
      saveTabs(tabs);
      const activeTabId = tabs.find((t) => t.id === s.activeTabId) ? s.activeTabId : 'home';
      saveActiveTab(activeTabId);
      return { nodes: [...s.nodes], tabs, activeTabId };
    });
  },

  pairMachine(connectionId, machineId, base64Secret) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    if (!node?.gatewayNode) return;
    node.gatewayNode.pairMachine(machineId, base64Secret);
    set((s) => ({ nodes: [...s.nodes] }));
  },

  unpairMachine(connectionId, machineId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    if (!node?.gatewayNode) return;
    node.gatewayNode.unpairMachine(machineId);
    set((s) => ({ nodes: [...s.nodes] }));
  },

  getConnection(connectionId, machineId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    if (!node) return null;
    if (node.directConn) return node.directConn;
    if (node.gatewayNode && machineId) {
      return node.gatewayNode.getMachineConnection(machineId);
    }
    return null;
  },

  openProjectTab(connectionId, machineId, projectId, label) {
    set((s) => {
      // Dedup: if this project tab already exists, just activate it
      const existing = s.tabs.find(
        (t) => t.connectionId === connectionId
          && t.machineId === machineId
          && t.projectId === projectId,
      );
      if (existing) {
        saveActiveTab(existing.id);
        return { activeTabId: existing.id };
      }

      const tab: TabPersisted = {
        id: uuid(),
        type: 'project',
        connectionId,
        machineId,
        projectId,
        label,
      };
      const tabs = [...s.tabs, tab];
      saveTabs(tabs);
      saveActiveTab(tab.id);

      // If gateway, add ref to machine connection
      const node = s.nodes.find((n) => n.entry.id === connectionId);
      if (node?.gatewayNode && machineId) {
        const conn = node.gatewayNode.getMachineConnection(machineId);
        conn?.addRef();
      }

      return { tabs, activeTabId: tab.id };
    });
  },

  closeTab(tabId) {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab || tab.type === 'home') return s;

      // If gateway, remove ref from machine connection
      if (tab.connectionId && tab.machineId) {
        const node = s.nodes.find((n) => n.entry.id === tab.connectionId);
        if (node?.gatewayNode) {
          const conn = node.gatewayNode.getMachineConnection(tab.machineId);
          conn?.removeRef();
        }
      }

      const tabs = s.tabs.filter((t) => t.id !== tabId);
      saveTabs(tabs);

      // If closing active tab, switch to previous tab or home
      let activeTabId = s.activeTabId;
      if (activeTabId === tabId) {
        const closedIdx = s.tabs.findIndex((t) => t.id === tabId);
        const nextTab = tabs[Math.min(closedIdx, tabs.length - 1)];
        activeTabId = nextTab?.id || 'home';
        saveActiveTab(activeTabId);
      }

      return { tabs, activeTabId };
    });
  },

  setActiveTab(tabId) {
    saveActiveTab(tabId);
    set({ activeTabId: tabId });
  },

  reorderTabs(fromIndex, toIndex) {
    set((s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      saveTabs(tabs);
      return { tabs };
    });
  },

  getNode(connectionId) {
    return get().nodes.find((n) => n.entry.id === connectionId);
  },

  getGatewayNode(connectionId) {
    return get().nodes.find((n) => n.entry.id === connectionId)?.gatewayNode;
  },

  getMachines(connectionId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    return node?.gatewayNode?.machines ?? [];
  },

  getSession(connectionId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    return node?.gatewayNode?.session ?? null;
  },
}));
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/connection-store.ts
git commit -m "feat(connections): implement Zustand ConnectionStore with persistence"
```

---

## Task 7: ConnectionContext (React Provider + Hook)

**Files:**
- Create: `frontend/src/contexts/ConnectionContext.tsx`

- [ ] **Step 1: Implement ConnectionProvider and useConnection hook**

```tsx
// frontend/src/contexts/ConnectionContext.tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { UnifiedConnection } from '@/lib/connections/types';

const ConnectionContext = createContext<UnifiedConnection | null>(null);

interface ConnectionProviderProps {
  connection: UnifiedConnection;
  children: ReactNode;
}

export function ConnectionProvider({ connection, children }: ConnectionProviderProps) {
  return (
    <ConnectionContext.Provider value={connection}>
      {children}
    </ConnectionContext.Provider>
  );
}

/**
 * Get the active UnifiedConnection for the current tab.
 * All API calls should use conn.fetch() and conn.openWs() from this hook.
 */
export function useConnection(): UnifiedConnection {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}

/**
 * Optional: get connection or null (for components that may render outside a connection context).
 */
export function useOptionalConnection(): UnifiedConnection | null {
  return useContext(ConnectionContext);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/ConnectionContext.tsx
git commit -m "feat(connections): add ConnectionProvider and useConnection hook"
```

---

## Task 8: Tab Bar UI

**Files:**
- Create: `frontend/src/components/tabs/TabBar.tsx`

- [ ] **Step 1: Implement TabBar component**

```tsx
// frontend/src/components/tabs/TabBar.tsx
import { useCallback } from 'react';
import { X, Home, Plus } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useConnectionStore();

  const handleAddClick = useCallback(() => {
    setActiveTab('home');
  }, [setActiveTab]);

  return (
    <div
      className="flex items-center border-b border-border bg-muted/50 overflow-x-auto"
      style={{ minHeight: '36px' }}
    >
      {/* Home tab — always first, not closable */}
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-border whitespace-nowrap shrink-0 transition-colors ${
          activeTabId === 'home'
            ? 'bg-background text-foreground'
            : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
        }`}
        onClick={() => setActiveTab('home')}
      >
        <Home size={13} />
        Home
      </button>

      {/* Project tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-1 px-3 py-1.5 text-xs border-r border-border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            activeTabId === tab.id
              ? 'bg-background text-foreground font-medium'
              : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
          }`}
          onClick={() => setActiveTab(tab.id)}
          title={tab.label}
        >
          <span className="max-w-[160px] truncate">{tab.label}</span>
          <button
            className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-foreground/10 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {/* Add button — switches to Home tab */}
      <button
        className="flex items-center justify-center px-2 py-1.5 text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
        onClick={handleAddClick}
        title="New tab (go to Home)"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/TabBar.tsx
git commit -m "feat(ui): implement TabBar component with home + project tabs"
```

---

## Task 9: AddConnectionForm

**Files:**
- Create: `frontend/src/components/tabs/AddConnectionForm.tsx`

- [ ] **Step 1: Implement AddConnectionForm**

Extract and adapt from the existing `TauriConnectionSetupForm` in `GatewayGate.tsx`:

```tsx
// frontend/src/components/tabs/AddConnectionForm.tsx
import { useState, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection-store';

type ConnectionMode = 'direct' | 'gateway';

export function AddConnectionForm({ onDone }: { onDone?: () => void }) {
  const addConnection = useConnectionStore((s) => s.addConnection);
  const [mode, setMode] = useState<ConnectionMode>('direct');
  const [url, setUrl] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const testConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const resp = await fetch(`${url}/api/config/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) setTestStatus('success');
      else {
        setTestStatus('error');
        setTestError(`Server returned ${resp.status}`);
      }
    } catch (e) {
      setTestStatus('error');
      setTestError(e instanceof Error ? e.message : 'Could not reach backend');
    }
  }, [url]);

  const handleAdd = useCallback(() => {
    if (!url.trim()) return;
    addConnection(mode, url.trim());
    setUrl('');
    setTestStatus('idle');
    onDone?.();
  }, [mode, url, addConnection, onDone]);

  return (
    <div className="border border-border rounded-md p-3 bg-background space-y-3">
      <div className="flex gap-2">
        <button
          className={`px-2 py-1 text-xs rounded border ${
            mode === 'direct'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-foreground/70 hover:text-foreground'
          }`}
          onClick={() => setMode('direct')}
        >
          Direct (Local)
        </button>
        <button
          className={`px-2 py-1 text-xs rounded border ${
            mode === 'gateway'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-foreground/70 hover:text-foreground'
          }`}
          onClick={() => setMode('gateway')}
        >
          E2EE Gateway
        </button>
      </div>

      <div>
        <label className="text-xs text-foreground/60 block mb-1">
          {mode === 'direct' ? 'Backend URL' : 'Gateway URL'}
        </label>
        <input
          className="w-full px-2 py-1.5 text-sm bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTestStatus('idle');
          }}
          placeholder={mode === 'direct' ? 'http://localhost:3001' : 'https://gateway.example.com'}
        />
      </div>

      {mode === 'direct' && (
        <div className="flex gap-2 items-center">
          <button
            className="px-2 py-1 text-xs border border-border rounded text-foreground/70 hover:text-foreground"
            onClick={testConnection}
            disabled={testStatus === 'testing' || !url}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {testStatus === 'success' && (
            <span className="text-xs text-green-500">Connected</span>
          )}
          {testStatus === 'error' && (
            <span className="text-xs text-destructive">{testError}</span>
          )}
        </div>
      )}

      <button
        className="w-full px-3 py-1.5 text-sm font-medium bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
        onClick={handleAdd}
        disabled={!url.trim()}
      >
        Add Connection
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/AddConnectionForm.tsx
git commit -m "feat(ui): implement AddConnectionForm for adding direct/gateway connections"
```

---

## Task 10: HomeTab (Overview Tree)

**Files:**
- Create: `frontend/src/components/tabs/HomeTab.tsx`

- [ ] **Step 1: Implement HomeTab with connection tree**

```tsx
// frontend/src/components/tabs/HomeTab.tsx
import { useState, useCallback, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Server,
  Globe,
  MoreHorizontal,
  LogOut,
  Pencil,
  Trash2,
  ExternalLink,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useConnectionStore, type ConnectionStore } from '@/stores/connection-store';
import { AddConnectionForm } from './AddConnectionForm';
import type { GatewayNode } from '@/lib/connections/gateway-node';
import type { MachineStatus } from '@/lib/e2ee';
import type { Project } from '@/lib/connections/types';

export function HomeTab() {
  const nodes = useConnectionStore((s) => s.nodes);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Connections</h2>
        <button
          className="px-2 py-1 text-xs border border-border rounded text-foreground/70 hover:text-foreground"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAddForm && <AddConnectionForm onDone={() => setShowAddForm(false)} />}

      {nodes.length === 0 && !showAddForm && (
        <p className="text-sm text-foreground/50 text-center py-8">
          No connections configured. Click "+ Add" to get started.
        </p>
      )}

      <div className="space-y-2">
        {nodes.map((node) =>
          node.entry.type === 'direct' ? (
            <DirectNodeView key={node.entry.id} node={node} />
          ) : (
            <GatewayNodeView key={node.entry.id} node={node} />
          ),
        )}
      </div>
    </div>
  );
}

// -- Direct Node --

function DirectNodeView({ node }: { node: { entry: { id: string; url: string; label?: string }; directConn?: { status: string; error: string | null } } }) {
  const { removeConnection, openProjectTab } = useConnectionStore();
  const [expanded, setExpanded] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const conn = useConnectionStore((s) => s.getConnection(node.entry.id));

  useEffect(() => {
    if (!expanded || !conn) return;
    setLoading(true);
    conn.listProjects().then(setProjects).catch(() => setProjects([])).finally(() => setLoading(false));
  }, [expanded, conn]);

  return (
    <div className="border border-border rounded-md bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Server size={14} className="text-foreground/60" />
        <span className="text-sm font-medium flex-1 truncate">{node.entry.label || node.entry.url}</span>
        <span className="text-xs text-foreground/40">Direct</span>
        <div className="relative">
          <button
            className="p-1 rounded hover:bg-foreground/10"
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          >
            <MoreHorizontal size={14} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[120px]">
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); removeConnection(node.entry.id); }}
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pl-8 space-y-1">
          {loading && <p className="text-xs text-foreground/40">Loading projects...</p>}
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="flex-1 truncate">{p.name}</span>
              <button
                className="text-xs text-foreground/50 hover:text-foreground flex items-center gap-1"
                onClick={() => openProjectTab(node.entry.id, undefined, p.id, p.name)}
              >
                <ExternalLink size={12} /> open
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Gateway Node --

function GatewayNodeView({ node }: { node: { entry: { id: string; url: string; label?: string }; gatewayNode?: GatewayNode } }) {
  const { removeConnection, logoutConnection, loginConnection, signupConnection, pairMachine, openProjectTab } =
    useConnectionStore();
  const [expanded, setExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const gwNode = node.gatewayNode;

  // Subscribe to gateway node changes
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!gwNode) return;
    return gwNode.onChange(() => setTick((t) => t + 1));
  }, [gwNode]);

  if (!gwNode) return null;

  const isLoggedIn = !!gwNode.session;

  return (
    <div className="border border-border rounded-md bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Globe size={14} className="text-foreground/60" />
        <span className="text-sm font-medium flex-1 truncate">{node.entry.label || node.entry.url}</span>
        <span className="text-xs text-foreground/40">E2EE</span>
        <div className="relative">
          <button
            className="p-1 rounded hover:bg-foreground/10"
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          >
            <MoreHorizontal size={14} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[120px]">
              {isLoggedIn && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-foreground/5"
                  onClick={(e) => { e.stopPropagation(); logoutConnection(node.entry.id); setShowMenu(false); }}
                >
                  <LogOut size={12} /> Sign out
                </button>
              )}
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); removeConnection(node.entry.id); }}
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pl-8">
          {!isLoggedIn ? (
            <GatewayLoginForm
              connectionId={node.entry.id}
              registrationOpen={gwNode.registrationOpen}
              authError={gwNode.authError}
              authLoading={gwNode.authLoading}
            />
          ) : (
            <div className="space-y-2">
              {gwNode.machines.length === 0 && (
                <p className="text-xs text-foreground/40">No machines online</p>
              )}
              {gwNode.machines.map((m) => (
                <MachineNodeView
                  key={m.machine_id}
                  machine={m}
                  connectionId={node.entry.id}
                  gatewayNode={gwNode}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -- Gateway Login Form (inline) --

function GatewayLoginForm({
  connectionId,
  registrationOpen,
  authError,
  authLoading,
}: {
  connectionId: string;
  registrationOpen: boolean | null;
  authError: string | null;
  authLoading: boolean;
}) {
  const { loginConnection, signupConnection } = useConnectionStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');

  const handleSubmit = async () => {
    if (isSignup) {
      await signupConnection(connectionId, email, password, name || undefined);
    } else {
      await loginConnection(connectionId, email, password);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-foreground/50">Not logged in</p>
      {isSignup && (
        <input
          className="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        className="w-full px-2 py-1 text-xs bg-background border border-border rounded"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full px-2 py-1 text-xs bg-background border border-border rounded"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
      />
      {authError && <p className="text-xs text-destructive">{authError}</p>}
      <div className="flex gap-2 items-center">
        <button
          className="px-2 py-1 text-xs bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={authLoading || !email || !password}
        >
          {authLoading ? '...' : isSignup ? 'Sign up' : 'Log in'}
        </button>
        {registrationOpen && (
          <button
            className="text-xs text-foreground/50 hover:text-foreground underline"
            onClick={() => setIsSignup(!isSignup)}
          >
            {isSignup ? 'Already have an account?' : 'Create account'}
          </button>
        )}
      </div>
    </div>
  );
}

// -- Machine Node (inside a gateway) --

function MachineNodeView({
  machine,
  connectionId,
  gatewayNode,
}: {
  machine: MachineStatus;
  connectionId: string;
  gatewayNode: GatewayNode;
}) {
  const { openProjectTab, pairMachine } = useConnectionStore();
  const [expanded, setExpanded] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [pairSecret, setPairSecret] = useState('');
  const [pairError, setPairError] = useState('');
  const isPaired = gatewayNode.isMachinePaired(machine.machine_id);

  useEffect(() => {
    if (!expanded || !isPaired) return;
    setLoading(true);

    const conn = gatewayNode.getMachineConnection(machine.machine_id);
    if (!conn) { setLoading(false); return; }

    conn.addRef();
    conn.connect()
      .then(() => conn.listProjects())
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => {
        setLoading(false);
        conn.removeRef();
      });
  }, [expanded, isPaired, machine.machine_id, gatewayNode]);

  const handlePair = () => {
    try {
      pairMachine(connectionId, machine.machine_id, pairSecret.trim());
      setPairSecret('');
      setPairError('');
    } catch (e) {
      setPairError(e instanceof Error ? e.message : 'Invalid secret');
    }
  };

  return (
    <div className="border border-border/50 rounded bg-background/50">
      <div className="flex items-center gap-2 px-2 py-1.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isPaired ? <Wifi size={12} className="text-green-500" /> : <WifiOff size={12} className="text-foreground/30" />}
        <span className="text-xs flex-1 truncate">
          {machine.hostname || machine.machine_id.slice(0, 8)}
          {machine.port ? `:${machine.port}` : ''}
        </span>
        {!isPaired && <span className="text-[10px] text-foreground/40">Not paired</span>}
      </div>

      {expanded && (
        <div className="px-2 pb-2 pl-7 space-y-1">
          {!isPaired ? (
            <div className="space-y-1">
              <input
                className="w-full px-2 py-1 text-xs bg-muted border border-border rounded"
                placeholder="Paste master secret (base64)"
                value={pairSecret}
                onChange={(e) => setPairSecret(e.target.value)}
              />
              {pairError && <p className="text-[10px] text-destructive">{pairError}</p>}
              <button
                className="px-2 py-0.5 text-xs bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
                onClick={handlePair}
                disabled={!pairSecret.trim()}
              >
                Pair
              </button>
            </div>
          ) : loading ? (
            <p className="text-xs text-foreground/40">Loading projects...</p>
          ) : (
            projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="flex-1 truncate">{p.name}</span>
                <button
                  className="text-foreground/50 hover:text-foreground flex items-center gap-1"
                  onClick={() => {
                    const machineLabel = machine.hostname || machine.machine_id.slice(0, 8);
                    openProjectTab(connectionId, machine.machine_id, p.id, `${p.name} @ ${machineLabel}`);
                  }}
                >
                  <ExternalLink size={10} /> open
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/HomeTab.tsx
git commit -m "feat(ui): implement HomeTab with connection tree view"
```

---

## Task 11: ProjectTab + TabShell

**Files:**
- Create: `frontend/src/components/tabs/ProjectTab.tsx`
- Create: `frontend/src/components/tabs/TabShell.tsx`

- [ ] **Step 1: Implement ProjectTab**

```tsx
// frontend/src/components/tabs/ProjectTab.tsx
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';
import type { TabPersisted, UnifiedConnection } from '@/lib/connections/types';
import App from '@/App';

export function ProjectTab({ tab }: { tab: TabPersisted }) {
  const getConnection = useConnectionStore((s) => s.getConnection);
  const conn = tab.connectionId
    ? getConnection(tab.connectionId, tab.machineId)
    : null;

  // Subscribe to connection status changes to re-render on reconnect
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    return conn.onStatusChange(() => setTick((t) => t + 1));
  }, [conn]);

  if (!conn) {
    return (
      <div className="flex items-center justify-center h-full text-foreground/50 text-sm">
        Connection not found. The connection may have been removed.
      </div>
    );
  }

  if (conn.status === 'connecting' || conn.status === 'reconnecting') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-foreground/60 text-sm animate-pulse">
            {conn.status === 'reconnecting' ? conn.error || 'Reconnecting...' : 'Connecting...'}
          </p>
        </div>
      </div>
    );
  }

  if (conn.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-destructive text-sm">{conn.error || 'Connection error'}</p>
          <button
            className="px-3 py-1 text-xs bg-foreground text-background rounded hover:opacity-85"
            onClick={() => conn.connect().catch(() => {})}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (conn.status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full text-foreground/50 text-sm">
        Not connected
      </div>
    );
  }

  // Auto-connect gateway machine connections when tab mounts
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <App />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 2: Implement TabShell**

```tsx
// frontend/src/components/tabs/TabShell.tsx
import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { TabBar } from './TabBar';
import { HomeTab } from './HomeTab';
import { ProjectTab } from './ProjectTab';

export function TabShell() {
  const { initialized, init, tabs, activeTabId } = useConnectionStore();

  useEffect(() => {
    init();
  }, [init]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        {/* Home tab */}
        <div className={`h-full overflow-auto ${activeTabId === 'home' ? '' : 'hidden'}`}>
          <HomeTab />
        </div>

        {/* Project tabs — keep mounted to preserve state, hide inactive */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${activeTabId === tab.id ? '' : 'hidden'}`}
          >
            <ProjectTab tab={tab} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tabs/ProjectTab.tsx frontend/src/components/tabs/TabShell.tsx
git commit -m "feat(ui): implement ProjectTab and TabShell as top-level app wrapper"
```

---

## Task 12: Wire Up main.tsx

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Replace GatewayProvider + GatewayGate with TabShell**

In `frontend/src/main.tsx`, replace the `GatewayProvider` and `GatewayGate` wrapping with the new `TabShell`. The key change is:

**Before:**
```tsx
import { GatewayProvider } from '@/contexts/GatewayContext';
import { GatewayGate } from '@/components/gateway/GatewayGate';
// ...
<GatewayProvider>
  <GatewayGate>
    <App />
  </GatewayGate>
</GatewayProvider>
```

**After:**
```tsx
import { TabShell } from '@/components/tabs/TabShell';
// ...
<TabShell />
```

The full render block becomes:
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
          <TabShell />
        </Sentry.ErrorBoundary>
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

Remove the imports for `GatewayProvider` and `GatewayGate`.

- [ ] **Step 2: Verify the app starts**

Run: `cd frontend && pnpm run check`
Expected: No type errors. (Some unused imports in old gateway files may warn — that's expected.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: wire TabShell as top-level app wrapper, replacing GatewayProvider+GatewayGate"
```

---

## Task 13: Adapt api.ts to Use ConnectionContext

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/gatewayMode.ts`

The key challenge: `makeRequest` in `api.ts` is a standalone function, not a React hook, so it can't call `useConnection()`. We need a module-level "active connection" reference that gets set when a tab becomes active.

- [ ] **Step 1: Update gatewayMode.ts to support UnifiedConnection**

Replace the content of `frontend/src/lib/gatewayMode.ts`:

```typescript
// frontend/src/lib/gatewayMode.ts
/**
 * Module-level connection accessor for non-React code (api.ts, utils).
 * Set by ConnectionProvider when a tab's connection becomes active.
 */
import type { UnifiedConnection } from '@/lib/connections/types';

let activeConnection: UnifiedConnection | null = null;

/** Set the active connection (called by ConnectionProvider on mount/update) */
export function setActiveConnection(conn: UnifiedConnection | null): void {
  activeConnection = conn;
}

/** Get the active connection (used by makeRequest in api.ts) */
export function getActiveConnection(): UnifiedConnection | null {
  return activeConnection;
}

// Legacy compatibility — these are used by code that hasn't been migrated yet.
// They delegate to the active connection.
export function getGatewayConnection(): { remoteFetch: UnifiedConnection['fetch'] } | null {
  if (!activeConnection || activeConnection.type !== 'gateway') return null;
  return { remoteFetch: activeConnection.fetch.bind(activeConnection) };
}

export function setGatewayConnection(): void {
  // no-op — managed by setActiveConnection now
}

export async function detectGatewayMode(): Promise<boolean> {
  return activeConnection?.type === 'gateway';
}

export function isGatewayMode(): boolean {
  return activeConnection?.type === 'gateway';
}
```

- [ ] **Step 2: Update ConnectionContext to set the active connection**

In `frontend/src/contexts/ConnectionContext.tsx`, add an effect that calls `setActiveConnection`:

```tsx
// Add to the existing file, update ConnectionProvider:
import { useEffect } from 'react';
import { setActiveConnection } from '@/lib/gatewayMode';

export function ConnectionProvider({ connection, children }: ConnectionProviderProps) {
  // Set module-level active connection so non-React code (api.ts) can access it
  useEffect(() => {
    setActiveConnection(connection);
    return () => {
      // Only clear if we're still the active connection
      setActiveConnection(null);
    };
  }, [connection]);

  return (
    <ConnectionContext.Provider value={connection}>
      {children}
    </ConnectionContext.Provider>
  );
}
```

- [ ] **Step 3: Update makeRequest in api.ts**

Update the `makeRequest` function in `frontend/src/lib/api.ts` (around lines 149-171):

**Before:**
```typescript
const makeRequest = async (
  url: string,
  options: RequestInit = {},
  extra?: { timeoutMs?: number }
) => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const { getGatewayConnection } = await import('@/lib/gatewayMode');
  const conn = getGatewayConnection();
  if (conn) {
    return conn.remoteFetch(url, { ...options, headers }, extra);
  }
  const baseUrl = getApiBaseUrl();
  return fetch(baseUrl ? `${baseUrl}${url}` : url, {
    ...options,
    headers,
  });
};
```

**After:**
```typescript
const makeRequest = async (
  url: string,
  options: RequestInit = {},
  extra?: { timeoutMs?: number }
) => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Use the active UnifiedConnection if available
  const { getActiveConnection } = await import('@/lib/gatewayMode');
  const conn = getActiveConnection();
  if (conn) {
    return conn.fetch(url, { ...options, headers }, extra);
  }

  // Fallback: direct fetch (browser mode without TabShell, or no active connection)
  const baseUrl = getApiBaseUrl();
  return fetch(baseUrl ? `${baseUrl}${url}` : url, {
    ...options,
    headers,
  });
};
```

Also update any other `getGatewayConnection()` usage in the file (around line 1241) with the same pattern.

- [ ] **Step 4: Update getWsBaseUrl to use active connection**

In `frontend/src/lib/api.ts`, update `getWsBaseUrl()` (around line 137):

```typescript
export function getWsBaseUrl(): string {
  // If there's an active connection, derive WS URL from it
  const { getActiveConnection } = require('@/lib/gatewayMode');
  const conn = getActiveConnection();
  if (conn) {
    return conn.url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  }

  if (typeof window !== 'undefined' && window.__TAURI__) {
    const backendUrl = localStorage.getItem('vb-backend-url') || '';
    if (backendUrl) {
      return backendUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    }
    return '';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/gatewayMode.ts frontend/src/lib/api.ts frontend/src/contexts/ConnectionContext.tsx
git commit -m "feat(connections): adapt api.ts and gatewayMode.ts to use UnifiedConnection"
```

---

## Task 14: Migrate WebSocket Hooks

**Files:**
- Modify: `frontend/src/hooks/useLogStream.ts`
- Modify: `frontend/src/hooks/useJsonPatchWsStream.ts`
- Modify: `frontend/src/utils/streamJsonPatchEntries.ts`
- Modify: `frontend/src/components/panels/XTermInstance.tsx`

All four files follow the same pattern: they call `getGatewayConnection()` and branch on whether it returns a connection. Replace this with `getActiveConnection()?.openWs()`.

- [ ] **Step 1: Migrate useLogStream.ts**

In `frontend/src/hooks/useLogStream.ts`, replace the WebSocket creation block (around lines 40-52):

**Before:**
```typescript
const conn = getGatewayConnection();
let ws: WebSocket | RemoteWs;
if (conn) {
  ws = conn.openWsStream(
    `/api/execution-processes/${processId}/raw-logs/ws`
  );
} else {
  const wsBase = getWsBaseUrl();
  ws = new WebSocket(
    `${wsBase}/api/execution-processes/${processId}/raw-logs/ws`
  );
}
```

**After:**
```typescript
import { getActiveConnection } from '@/lib/gatewayMode';
// Remove imports for: getGatewayConnection, getWsBaseUrl, RemoteWs

const activeConn = getActiveConnection();
const ws = activeConn
  ? activeConn.openWs(`/api/execution-processes/${processId}/raw-logs/ws`)
  : new WebSocket(`${getWsBaseUrl()}/api/execution-processes/${processId}/raw-logs/ws`);
```

Update the `wsRef` type from `useRef<WebSocket | RemoteWs | null>` to `useRef<WebSocket | WebSocketLike | null>` (import `WebSocketLike` from `@/lib/connections/types`).

- [ ] **Step 2: Migrate useJsonPatchWsStream.ts**

Same pattern. Replace the WS creation block (around lines 113-127):

**After:**
```typescript
import { getActiveConnection } from '@/lib/gatewayMode';

const activeConn = getActiveConnection();
let ws: WebSocket | WebSocketLike;
if (activeConn) {
  const url = new URL(endpoint, window.location.origin);
  ws = activeConn.openWs(
    url.pathname,
    url.search?.substring(1) || undefined
  );
} else {
  const wsBase = getWsBaseUrl();
  const wsEndpoint = endpoint.startsWith('/')
    ? `${wsBase}${endpoint}`
    : endpoint.replace(/^http/, 'ws');
  ws = new WebSocket(wsEndpoint);
}
```

- [ ] **Step 3: Migrate streamJsonPatchEntries.ts**

Same pattern in `frontend/src/utils/streamJsonPatchEntries.ts` (around lines 139-147).

- [ ] **Step 4: Migrate XTermInstance.tsx**

Same pattern in `frontend/src/components/panels/XTermInstance.tsx` (around lines 190-194). Also update the fetch call around line 99 that uses `getWsBaseUrl()`.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useLogStream.ts frontend/src/hooks/useJsonPatchWsStream.ts frontend/src/utils/streamJsonPatchEntries.ts frontend/src/components/panels/XTermInstance.tsx
git commit -m "refactor: migrate WebSocket hooks to use UnifiedConnection.openWs()"
```

---

## Task 15: Update E2EE Manager Storage Key

**Files:**
- Modify: `frontend/src/lib/e2ee/manager.ts`

- [ ] **Step 1: Update storage key constant**

In `frontend/src/lib/e2ee/manager.ts`, change line 10:

**Before:**
```typescript
const MACHINE_SECRETS_KEY = 'vk_e2ee_machine_secrets';
```

**After:**
```typescript
const MACHINE_SECRETS_KEY = 'vb_e2ee_machine_secrets';
```

The migration in Task 5 already handles copying the old key to the new one.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/e2ee/manager.ts
git commit -m "refactor: rename E2EE manager storage key from vk_ to vb_ prefix"
```

---

## Task 16: Update Navbar

**Files:**
- Modify: `frontend/src/components/layout/Navbar.tsx`

- [ ] **Step 1: Remove gateway-specific code from Navbar**

The Navbar currently imports `useGateway` to display machine info and provide a "Switch Machine" button. With the new tab architecture, machine switching happens via the Home tab. Remove the gateway-specific logic:

Remove these from Navbar:
- The `useGateway()` import and destructuring (around line 101)
- The `handleSwitchMachine` callback
- The machine display section in the JSX (the hostname/port display and ArrowLeftRight button)

The Navbar should still show project name and other non-gateway UI. If `useOptionalConnection()` is available, show the connection label instead.

**Key changes:**
```typescript
// Remove:
import { useGateway } from '@/contexts/GatewayContext';
// Replace with:
import { useOptionalConnection } from '@/contexts/ConnectionContext';

// In component body, remove:
const { phase: gwPhase, selectedMachineId, machines, disconnectMachine } = useGateway();
// Replace with:
const connection = useOptionalConnection();

// Remove: handleSwitchMachine, isGatewayReady, selectedMachine variables
// Remove: the machine display JSX section
```

If the connection is available, show a small connection indicator (e.g., the connection label).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Navbar.tsx
git commit -m "refactor: remove gateway-specific code from Navbar, use connection context"
```

---

## Task 17: Keyboard Shortcuts

**Files:**
- Modify: `frontend/src/components/tabs/TabShell.tsx`

- [ ] **Step 1: Add keyboard shortcuts to TabShell**

Add a `useEffect` in `TabShell` to handle Ctrl+1~9, Ctrl+W:

```tsx
// Add to TabShell, after the init effect:
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+1~9: switch to tab by position
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      if (idx === 0) {
        setActiveTab('home');
      } else {
        const tab = tabs[idx - 1]; // tabs array is 0-indexed, Ctrl+2 = first project tab
        if (tab) setActiveTab(tab.id);
      }
    }

    // Ctrl+W: close active tab
    if (e.ctrlKey && e.key === 'w') {
      if (activeTabId !== 'home') {
        e.preventDefault();
        closeTab(activeTabId);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [tabs, activeTabId, setActiveTab, closeTab]);
```

Also destructure `closeTab` and `setActiveTab` from the store in `TabShell`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && pnpm run check`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/TabShell.tsx
git commit -m "feat(ui): add Ctrl+1~9 and Ctrl+W keyboard shortcuts for tabs"
```

---

## Task 18: Clean Up Old Gateway Files

**Files:**
- Delete: `frontend/src/contexts/GatewayContext.tsx`
- Delete: `frontend/src/components/gateway/GatewayGate.tsx`
- Delete: `frontend/src/components/gateway/GatewayLoginPage.tsx`
- Delete: `frontend/src/components/gateway/GatewayMachineSelectPage.tsx`
- Modify: `frontend/src/hooks/useGatewayAuth.ts` (remove or adapt)
- Modify: `frontend/src/components/dialogs/E2EESettingsDialog.tsx` (update imports)

- [ ] **Step 1: Remove old files**

```bash
cd frontend
rm src/contexts/GatewayContext.tsx
rm src/components/gateway/GatewayGate.tsx
rm src/components/gateway/GatewayLoginPage.tsx
rm src/components/gateway/GatewayMachineSelectPage.tsx
```

- [ ] **Step 2: Fix remaining imports**

Search for any remaining imports of the deleted files and update them:

```bash
cd frontend && grep -r "GatewayContext\|GatewayGate\|GatewayLoginPage\|GatewayMachineSelectPage\|useGateway" src/ --include="*.ts" --include="*.tsx" -l
```

For each file found:
- `useGatewayAuth.ts`: Rewrite to use `useConnectionStore` and `useOptionalConnection` instead of `useGateway`
- `E2EESettingsDialog.tsx`: Update to use `useConnectionStore` to access pairing/unpairing methods
- Any other files: Update imports accordingly

- [ ] **Step 3: Verify TypeScript compiles with zero errors**

Run: `cd frontend && pnpm run check`
Expected: Clean compilation.

- [ ] **Step 4: Verify lint passes**

Run: `cd frontend && pnpm run lint`
Expected: No errors (warnings OK).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove old GatewayContext and gateway page components"
```

---

## Task 19: End-to-End Smoke Test

- [ ] **Step 1: Verify the app boots in Tauri mode**

Run: `pnpm run dev` and open the app.
Expected: The tab bar appears at the top with just the "Home" tab. The home tab shows "No connections configured."

- [ ] **Step 2: Test adding a direct connection**

1. Click "+ Add"
2. Select "Direct (Local)"
3. Enter `http://localhost:3001` (or whatever port the dev backend is on)
4. Click "Test Connection" — should show "Connected"
5. Click "Add Connection"
6. The connection appears in the tree. Expand it to see projects.
7. Click "open" on a project. A new tab appears and shows the project UI.

- [ ] **Step 3: Test adding a gateway connection (if gateway is available)**

1. Click "+ Add"
2. Select "E2EE Gateway"
3. Enter the gateway URL
4. Click "Add Connection"
5. The gateway appears in the tree as "Not logged in"
6. Enter email/password and log in
7. Machines appear. Pair a machine with its master secret.
8. Expand the machine to see projects. Open one — new tab.

- [ ] **Step 4: Test tab interactions**

1. Open multiple project tabs
2. Verify Ctrl+1 switches to Home, Ctrl+2 switches to first project tab, etc.
3. Verify Ctrl+W closes the current project tab
4. Verify clicking × on a tab closes it
5. Verify closing all tabs for a connection doesn't crash

- [ ] **Step 5: Test signout (the original bug)**

1. Connect to a gateway, log in, open a project tab
2. On the Home tab, click the menu on the gateway → Sign out
3. Verify: the gateway node shows "Not logged in" with the URL still visible
4. Verify: all project tabs under that gateway are closed
5. Verify: you can edit the URL or log in again

- [ ] **Step 6: Test persistence**

1. Open several project tabs across different connections
2. Reload the page (or restart the app)
3. Verify: tabs are restored, connections re-established

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes for enhanced connection manager"
```
