# Gateway state layer refactor — kill `GatewayNode` god-class

**Date**: 2026-05-10
**Branch**: `vb/d308-e2ee-gateway-web`
**Scope**: `frontend/src/lib/connections/gatewayNode.ts` + consumers + `src/lib/e2ee/manager.ts`

---

## Problem

After login to e2ee-gateway-web, the home page shows "No machines online" even though:

- The daemon is registered on the server (verified in server logs, matching `user_id`)
- The WebSocket `machines` message reaches the browser with the machine payload (verified in DevTools Network tab)
- The `gwNode.machines` array on the singleton instance contains the machine (verified by walking React fiber tree from Console)
- `gwNode.listeners.size === 3` confirming all subscribers are registered

Yet the UI stays on `<EmptyMachinesPlaceholder />`. Manually firing all listeners from the Console does not trigger a re-render. Clicking "Sign out" (which goes through a different code path) works.

### Root cause

`GatewayNode` is a mutable class that owns reactive state and exposes a hand-rolled pub/sub (`listeners: Set`, `onChange`, `notify`). Consumer components subscribe via:

```tsx
const [, force] = useState(0);
useEffect(() => gwNode.onChange(() => force((t) => t + 1)), [gwNode]);
```

Today there are **three parallel reactivity paths** all trying to keep the UI in sync with mutations on `gwNode`:

1. Local `force((t) => t + 1)` useState hacks inside each consumer component.
2. A Zustand "bridge" listener added in `connection-store.ts:160` — `node.onChange(() => set((s) => ({ nodes: [...s.nodes] })))`.
3. Zustand's own `useStore` subscriptions (used by tabs, activeTabId, etc. on top-level store fields).

The `force((t) => t + 1)` pattern is not safe under React 18 concurrent rendering — it was a React 16/17 workaround. React 18 requires `useSyncExternalStore` for external mutable state. Which of the three paths drops the update in this specific case is undetermined after hours of diagnostics — but the structural problem is that there are three paths at all. Continuing to patch individual paths is whack-a-mole.

---

## Goal

Remove `GatewayNode` entirely. Replace it with:

- Plain data slices in Zustand (single source of truth for reactive state).
- Pure service modules for HTTP / WebSocket lifecycle (imperative, dispatch actions to the store).
- A separate module-level registry for per-machine imperative resources (`GatewayMachineConnection` instances).
- Zustand `persist` middleware for `machineSecrets` — replaces `E2EEManager`'s manual localStorage juggling.

Success criteria:

- "No machines online" bug no longer reproducible — WebSocket `machines` messages update the UI deterministically.
- Exactly one reactivity path for every piece of state.
- `GatewayNode` class is deleted.
- `E2EEManager` class is deleted. Replaced by a pure module (`src/lib/e2ee/pairing.ts`) that reads pairing state from Zustand.
- Tauri multi-gateway mode still works.
- `pnpm run frontend:check` and `pnpm run lint` pass.
- Manual smoke: login → see machine → pair → open tab → projects load; sign out → login page.

Non-goals:

- Not refactoring `GatewayMachineConnection` (per-tab imperative resource — out of scope).
- Not rewriting the tabs / active-tab persistence (already uses its own manual localStorage, works fine).
- Not migrating old `vb_e2ee_machine_secrets` localStorage data — after upgrade, users re-pair every machine once.

---

## Design

### 1. Store shape

Zustand is the single source of truth for reactive state. All `GatewayNode` mutable fields migrate into a plain-data slice nested per connection.

```ts
// src/stores/connection-store.ts

interface GatewaySession {
  sessionToken: string;
  userId: string;
}

interface GatewayState {
  session: GatewaySession | null;
  machines: MachineStatus[];
  registrationOpen: boolean | null;
  authError: string | null;
  authLoading: boolean;
}

interface ConnectionNode {
  entry: ConnectionEntry;
  type: 'direct' | 'gateway';
  directConn?: DirectConnection;      // unchanged, imperative class
  gatewayUrl?: string;                 // constant, set at creation
  gatewayState?: GatewayState;         // plain data, reactive
}

interface ConnectionStore {
  nodes: ConnectionNode[];
  tabs: TabEntry[];
  activeTabId: string;
  initialized: boolean;

  // Pairing is global — one master secret per machineId across the whole browser.
  machineSecrets: Record<string, string>; // machineId -> base64 master secret

  // Fine-grained state setters (called by services, not by components directly)
  setGatewayField: <K extends keyof GatewayState>(
    connId: string, key: K, value: GatewayState[K]
  ) => void;
  setMachines: (connId: string, machines: MachineStatus[]) => void;
  upsertMachine: (connId: string, machine: MachineStatus) => void;
  removeMachine: (connId: string, machineId: string) => void;

  // High-level actions (called by components)
  init: () => void;
  loginConnection: (connId: string, email: string, password: string) => Promise<void>;
  signupConnection: (connId: string, email: string, password: string, name?: string) => Promise<void>;
  logoutConnection: (connId: string) => void;
  fetchRegistrationStatus: (connId: string) => Promise<void>;
  pairMachine: (machineId: string, secret: string) => void;
  unpairMachine: (machineId: string) => void;
  openMachineProjectsTab: (connId: string, machineId: string, label: string) => void;
  // ... existing tab actions
}
```

Decisions:

- **`machineSecrets` is global, not per-connection**. `E2EEManager` is a singleton today, one localStorage bucket. `machine_id` is globally unique. Per-connection split would be redundant duplication.
- **`gatewayUrl` is outside `gatewayState`** because it is a constant set at connection creation. `gatewayState` represents reactive, mutable data only.
- **Fine-grained setters (`setGatewayField`, `setMachines`, etc.) are public on the store** so that service modules can call them, but components should only call high-level actions.

### 2. Persist middleware for `machineSecrets`

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      machineSecrets: {},
      nodes: [],
      tabs: [],
      activeTabId: 'home',
      initialized: false,

      pairMachine(machineId, secret) {
        set((s) => ({
          machineSecrets: { ...s.machineSecrets, [machineId]: secret },
        }));
      },
      unpairMachine(machineId) {
        set((s) => {
          const { [machineId]: _removed, ...rest } = s.machineSecrets;
          return { machineSecrets: rest };
        });
      },
      // ... other actions
    }),
    {
      name: 'vb_connection_store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ machineSecrets: state.machineSecrets }),
    }
  )
);
```

Decisions:

- **Only `machineSecrets` is persisted via middleware.** `nodes`, `tabs`, `activeTabId` keep their existing manual persist logic — out of scope.
- **No `version` / `migrate` / `merge`**. Old `vb_e2ee_machine_secrets` key becomes orphaned; users re-pair after upgrade.
- **`storage: createJSONStorage(() => localStorage)` is explicit** even though localStorage is the default — makes intent readable, trivial to swap.
- **Zustand v4 TypeScript requires `create<T>()(persist(...))`** with an empty call before `persist`. Match existing codebase version (v4.5.4).

### 3. Service module: `src/services/gateway-service.ts`

Pure module. Holds per-connection imperative state (WebSocket handles) in a module-level `Map`. All state mutations go through dispatches to the Zustand store.

```ts
// src/services/gateway-service.ts
import { useConnectionStore } from '@/stores/connection-store';
import * as machineRegistry from './machine-registry';

const machineListSockets = new Map<string, WebSocket>();

type StoreApi = typeof useConnectionStore;

// --- Session persistence (per connection; separate from persist middleware) ---
export function loadPersistedSession(connId: string): GatewaySession | null {
  try {
    const raw = localStorage.getItem(`vb_gateway_session_${connId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(connId: string, session: GatewaySession | null): void {
  const key = `vb_gateway_session_${connId}`;
  if (session) localStorage.setItem(key, JSON.stringify(session));
  else localStorage.removeItem(key);
}

// --- Auth ---
export async function login(
  connId: string,
  gatewayUrl: string,
  email: string,
  password: string,
): Promise<void> {
  const store = useConnectionStore.getState();
  store.setGatewayField(connId, 'authLoading', true);
  store.setGatewayField(connId, 'authError', null);

  try {
    const resp = await fetch(`${gatewayUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) throw new Error((await resp.text()) || `Login failed (${resp.status})`);

    const { token, user_id } = await resp.json();
    const session: GatewaySession = { sessionToken: token, userId: user_id };
    persistSession(connId, session);
    store.setGatewayField(connId, 'session', session);
    store.setGatewayField(connId, 'authLoading', false);

    startMachineListWs(connId, gatewayUrl, session);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Login failed';
    useConnectionStore.getState().setGatewayField(connId, 'authError', message);
    useConnectionStore.getState().setGatewayField(connId, 'authLoading', false);
  }
}

export async function signup(
  connId: string,
  gatewayUrl: string,
  email: string,
  password: string,
  name?: string,
): Promise<void> {
  // Identical structure to login: set authLoading, POST /api/auth/signup with
  // { email, password, name }, on success set session + persistSession +
  // startMachineListWs, on error set authError. Not duplicated here for brevity.
}

export function logout(connId: string): void {
  stopMachineListWs(connId);
  machineRegistry.destroyAllForConnection(connId);
  persistSession(connId, null);
  const store = useConnectionStore.getState();
  store.setGatewayField(connId, 'session', null);
  store.setMachines(connId, []);
}

// --- Machine list WS ---
export function startMachineListWs(
  connId: string,
  gatewayUrl: string,
  session: GatewaySession,
): void {
  if (machineListSockets.has(connId)) return;

  const wsUrl = gatewayUrl.replace(/^http/, 'ws');
  const ws = new WebSocket(
    `${wsUrl}/ws/webui?token=${encodeURIComponent(session.sessionToken)}`
  );

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const store = useConnectionStore.getState();
      switch (msg.type) {
        case 'auth_ok':
          break;
        case 'auth_error':
          logout(connId);
          break;
        case 'machines':
          store.setMachines(connId, msg.machines);
          break;
        case 'machine_online':
          store.upsertMachine(connId, {
            machine_id: msg.machine_id,
            hostname: msg.hostname ?? '',
            platform: msg.platform ?? '',
            port: msg.port ?? 0,
          });
          break;
        case 'machine_offline':
          store.removeMachine(connId, msg.machine_id);
          break;
      }
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    machineListSockets.delete(connId);
  };
  ws.onerror = () => {
    console.warn(`[gateway-service] WS error for ${connId}`);
  };

  machineListSockets.set(connId, ws);
}

export function stopMachineListWs(connId: string): void {
  const ws = machineListSockets.get(connId);
  if (!ws) return;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.close();
  machineListSockets.delete(connId);
}

// --- Registration status ---
export async function fetchRegistrationStatus(
  connId: string,
  gatewayUrl: string,
): Promise<void> {
  const store = useConnectionStore.getState();
  try {
    const resp = await fetch(`${gatewayUrl}/api/auth/registration-status`);
    const { open } = await resp.json();
    store.setGatewayField(connId, 'registrationOpen', open);
  } catch {
    store.setGatewayField(connId, 'registrationOpen', false);
  }
}
```

Decisions:

- **Service module imports `useConnectionStore` directly** and calls `.getState()` / action methods. No dependency injection — flat and simple.
- **WebSocket handles never appear in React state.** The UI has no concept of "WS is connected" (matches current behavior); if we want that, it's a separate future refactor.
- **No auto-reconnect** — matches current `GatewayNode` behavior. Changing this is a separate issue.

### 4. Machine-connection registry: `src/services/machine-registry.ts`

Per-`(connectionId, machineId)` imperative resources. `GatewayMachineConnection` is unchanged; the registry is just explicit lifecycle management.

```ts
// src/services/machine-registry.ts
import { GatewayMachineConnection } from '@/lib/connections/gatewayConnection';
import type { GatewaySession } from '@/lib/connections/types';

const connections = new Map<string, GatewayMachineConnection>();
const keyOf = (connId: string, machineId: string) => `${connId}:${machineId}`;

export function getOrCreate(
  connId: string,
  machineId: string,
  gatewayUrl: string,
  session: GatewaySession,
  label: string,
): GatewayMachineConnection {
  const k = keyOf(connId, machineId);
  let c = connections.get(k);
  if (!c) {
    c = new GatewayMachineConnection(
      `${connId}:${machineId}`, gatewayUrl, label, gatewayUrl, session, machineId,
    );
    connections.set(k, c);
  }
  return c;
}

export function destroy(connId: string, machineId: string): void {
  const k = keyOf(connId, machineId);
  connections.get(k)?.disconnect();
  connections.delete(k);
}

export function destroyAllForConnection(connId: string): void {
  const prefix = `${connId}:`;
  for (const [k, c] of connections) {
    if (k.startsWith(prefix)) {
      c.disconnect();
      connections.delete(k);
    }
  }
}
```

### 5. E2EE pairing helper: `src/lib/e2ee/pairing.ts`

Replaces `E2EEManager.getContentPublicKey` — the only externally-used method of that class.

```ts
// src/lib/e2ee/pairing.ts
import { deriveContentKeyPair, type ContentKeyPair } from './keys';
import { useConnectionStore } from '@/stores/connection-store';

const keyPairCache = new Map<string, ContentKeyPair>();

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function getContentPublicKey(machineId: string): Uint8Array | null {
  const secret = useConnectionStore.getState().machineSecrets[machineId];
  if (!secret) return null;
  let kp = keyPairCache.get(secret);
  if (!kp) {
    kp = deriveContentKeyPair(base64ToBytes(secret));
    keyPairCache.set(secret, kp);
  }
  return kp.publicKey;
}
```

Decisions:

- **`E2EEManager` class deleted.** The only external method in use is `getContentPublicKey` (from `gatewayConnection.ts:190`). Other methods (`unwrapDek`, `setConnectionDek`, `getConnectionDek`, `removeConnectionDek`, `hasPairedSecrets`) have zero callers — dead code, removed.
- **Keypair cache lives at module scope.** Derivation is CPU-bound (Ed25519 → X25519), caching by base64 secret key is cheap and correct — same secret always derives same keypair.

### 6. Components

All consumer components switch from `gwNode: GatewayNode` prop to `connectionId: string` prop + Zustand selectors.

```tsx
// GatewayHomeTab.tsx
export function GatewayHomeTab({ connectionId }: { connectionId: string }) {
  const machines = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === connectionId)?.gatewayState?.machines ?? []
  );
  const logoutConnection = useConnectionStore((s) => s.logoutConnection);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h2>Machines</h2>
        <button onClick={() => logoutConnection(connectionId)}>Sign out</button>
      </header>
      {machines.length === 0
        ? <EmptyMachinesPlaceholder />
        : machines.map((m) => (
            <MachineRow key={m.machine_id} connectionId={connectionId} machine={m} />
          ))}
    </div>
  );
}

function MachineRow({ connectionId, machine }: {
  connectionId: string;
  machine: MachineStatus;
}) {
  const isPaired = useConnectionStore((s) => machine.machine_id in s.machineSecrets);
  const openTab = useConnectionStore((s) => s.openMachineProjectsTab);
  // ...
}
```

Patterns applied identically to:

- `GatewayShell.tsx` — subscribes to `session` for login/home routing; deletes the `force` useEffect.
- `GatewayLoginScreen.tsx` — reads `registrationOpen`, `authError`, `authLoading`; calls `loginConnection` / `signupConnection`.
- `MachinePairingForm.tsx` — reads `session` and `gatewayUrl`; calls `pairMachine(machineId, secret)`.
- `HomeTab.tsx` `GatewayNodeView` — the tauri-mode rendering; same prop swap + selectors.

### 7. Data flow for key paths

**Login**:
```
GatewayLoginScreen submit
  → store.loginConnection(connId, email, pw)          [action]
    → gatewayService.login(connId, gatewayUrl, ...)
      → store.setGatewayField(connId, 'authLoading', true)
      → fetch POST /api/auth/login
      → store.setGatewayField(connId, 'session', session)
      → persistSession(connId, session)                [manual localStorage]
      → gatewayService.startMachineListWs(connId, gatewayUrl, session)
        → new WebSocket(...)
        → ws.onmessage('machines') → store.setMachines(connId, ...)
                                        ↓ (Zustand broadcast via useSyncExternalStore)
                                        GatewayShell selector sees session → renders GatewayHomeTab
                                        GatewayHomeTab selector sees machines → renders list
```

**WS `machine_online` / `machine_offline`**:
```
ws.onmessage → store.upsertMachine / removeMachine
                  ↓
                Zustand broadcast → subscribed components re-render
```

**Pair**:
```
MachinePairingForm submit
  → POST /api/auth/device/register (409 OK — idempotent)
  → store.pairMachine(machineId, secret)     [action]
    → set(s => ({ machineSecrets: { ...s.machineSecrets, [machineId]: secret } }))
    → persist middleware auto-writes localStorage
      ↓
    MachineRow's `isPaired` selector sees change → WifiOff icon → Wifi icon
```

**Logout**:
```
GatewayHomeTab Sign out click
  → store.logoutConnection(connId)                   [action]
    → gatewayService.logout(connId)
      → gatewayService.stopMachineListWs(connId)
      → machineRegistry.destroyAllForConnection(connId)
      → persistSession(connId, null)
      → store.setGatewayField(connId, 'session', null)
      → store.setMachines(connId, [])
        ↓
      GatewayShell session selector sees null → renders GatewayLoginScreen
```

---

## Files changed

### New

| Path | Purpose | Size |
|---|---|---|
| `src/services/gateway-service.ts` | HTTP + WS + session persistence | ~200 lines |
| `src/services/machine-registry.ts` | Imperative per-machine connection lifecycle | ~40 lines |
| `src/lib/e2ee/pairing.ts` | `getContentPublicKey` module function | ~25 lines |

### Deleted

| Path | Reason |
|---|---|
| `src/lib/connections/gatewayNode.ts` | Responsibilities split across store / service / registry |
| `src/lib/e2ee/manager.ts` | Only `getContentPublicKey` has external callers; other methods are dead |

### Modified

| Path | Change |
|---|---|
| `src/stores/connection-store.ts` | Major. New `gatewayState` per node, `machineSecrets`, persist middleware, actions delegate to service, remove onChange bridge |
| `src/lib/e2ee/index.ts` | Drop `E2EEManager` export; add `getContentPublicKey` from pairing.ts |
| `src/lib/connections/index.ts` | Drop `GatewayNode` export |
| `src/lib/connections/gatewayConnection.ts` | `E2EEManager.getInstance().getContentPublicKey(...)` → direct `getContentPublicKey(...)` import (line 189–190) |
| `src/components/tabs/GatewayShell.tsx` | prop → connectionId via store; remove force useEffect |
| `src/components/tabs/GatewayHomeTab.tsx` | prop → connectionId; machines/isPaired via selectors |
| `src/components/tabs/GatewayLoginScreen.tsx` | Same pattern |
| `src/components/tabs/MachinePairingForm.tsx` | Same pattern |
| `src/components/tabs/HomeTab.tsx` (`GatewayNodeView`) | Same pattern for tauri mode |

**Totals**: +3 new / −2 deleted / 9 modified = **14 files**, ~500–700 net LOC change.

---

## Implementation order

Suggested sequence. The exact PR boundaries and intermediate consistency are
worked out in the implementation plan (see writing-plans). High-level shape:

### Step 1 — Additive foundation

- Add `GatewayState` interface and new `gatewayUrl` / `gatewayState` fields on `ConnectionNode` alongside existing `gatewayNode`.
- Add `machineSecrets: {}`, `persist` middleware, `pairMachine` / `unpairMachine` actions.
- Flip `MachinePairingForm` and `MachineRow.isPaired` to use the new `machineSecrets` path — smallest, self-contained slice of the refactor, validates persist integration.

### Step 2 — New service modules

- Create `gateway-service.ts`, `machine-registry.ts`, `e2ee/pairing.ts`. Pure additions.
- Unit tests cover: `login` happy/error path, WS onmessage dispatches, `getOrCreate` idempotence, pairing key derivation cache.

### Step 3 — Parallel writes, components still on old path

- Inside `GatewayNode` methods that mutate fields, also dispatch to the store slice (`store.setGatewayField(...)` etc.). Temporary dual-write keeps UI working while the slice stays in sync.
- No behavior change visible to users.

### Step 4 — Flip components to selectors (one commit per component)

Order: `GatewayLoginScreen` → `GatewayHomeTab` → `GatewayShell` → `HomeTab.GatewayNodeView`.

Each PR: prop type change, selector wiring, delete `force`/`onChange` boilerplate. Manual smoke after each. `MachinePairingForm` already flipped in Step 1.

### Step 5 — Invert the delegation

- Store actions (`loginConnection` etc.) call service modules directly. `GatewayNode` methods are no longer called; dual-write disappears.
- `gatewayConnection.ts:189–190` uses `getContentPublicKey` from `pairing.ts` instead of `E2EEManager`.

### Step 6 — Delete dead code

- Delete `gatewayNode.ts`, `e2ee/manager.ts`.
- Remove `gatewayNode: GatewayNode` field from `ConnectionNode`, the onChange bridge in `init`, unused imports.
- `pnpm run lint --fix`, `pnpm run frontend:check`.

---

## Testing

### Automated

- Unit tests for `gateway-service.ts`: mock `fetch` + mock WebSocket, assert state transitions by observing `useConnectionStore.getState()` after each step.
- Unit tests for `machine-registry.ts`: get/create idempotence, destroy removes from map, destroyAllForConnection scopes correctly.
- Unit tests for `pairing.ts`: cache hit/miss, unknown machineId returns null.
- `pnpm run frontend:check` — TypeScript.
- `pnpm run lint` — ESLint.
- `cargo test --workspace` — server unchanged but verify.

### Manual smoke (on deployed gateway)

1. Fresh browser (clear localStorage): sign up → see home → empty list.
2. Start a bridge daemon → machine appears in list automatically.
3. Paste master secret in pair form → "Paired" indicator appears.
4. Click machine row → projects tab opens and loads.
5. Click "Sign out" → back to login page.
6. Re-login → machine appears pre-paired (from persisted `machineSecrets`).
7. Tauri mode: add a second gateway connection → same flow works independently.

---

## Risks

| Risk | Mitigation |
|---|---|
| `GatewayMachineConnection`'s own onChange pattern (per-tab) breaks when ever-so-slightly touched | Don't touch it. Only the external `getContentPublicKey` call site changes. |
| Hidden `E2EEManager` consumer we missed | Grepped project — only `gatewayNode.ts` and `gatewayConnection.ts:190` reference it. Both covered. |
| Session persistence under service module + `machineSecrets` via middleware = two separate localStorage backends | Fine — they serve different scopes (per-connection vs global). Unifying is future work. |
| Tauri `HomeTab.GatewayNodeView` behaves differently from gateway-web `GatewayHomeTab` after refactor | Both in the file list; Step 4 hits them with the same pattern. Manual test covers both. |
| User loses existing pairing (must re-pair) | Documented in non-goals. One-time cost; value is correctness and simpler code. |
| Mid-refactor state (Step 3 dual-write) creates subtle inconsistency | Keep window short — Steps 3–6 are one PR total, merged quickly. |
