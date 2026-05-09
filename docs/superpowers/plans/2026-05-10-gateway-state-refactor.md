# Gateway State Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `GatewayNode` god-class and its self-rolled `onChange/notify` pub/sub with a Zustand-backed state layer so gateway-web reliably re-renders on WebSocket `machines` updates under React 18 concurrent rendering.

**Architecture:** Plain-data `GatewayState` slice per connection lives in Zustand (single source of truth). Imperative HTTP + WebSocket work moves to a pure `gateway-service.ts` module that dispatches store actions. Per-machine imperative resources (`GatewayMachineConnection`) live in a separate `machine-registry.ts` Map. `E2EEManager` class is replaced by a stateless `pairing.ts` helper that reads `machineSecrets` from the store (persisted via Zustand `persist` middleware).

**Tech Stack:** TypeScript, React 18 (Vite build), Zustand v4.5.4 (with `persist` + `createJSONStorage` from `zustand/middleware`), Vitest for unit tests. Spec: `docs/superpowers/specs/2026-05-10-gateway-node-refactor-design.md`.

---

## File Structure

### Create
- `frontend/src/lib/e2ee/pairing.ts` — `getContentPublicKey(machineId)` module helper (reads store)
- `frontend/src/lib/e2ee/__tests__/pairing.test.ts` — unit tests for pairing helper
- `frontend/src/services/machine-registry.ts` — module-level `Map<connId:machineId, GatewayMachineConnection>` with `getOrCreate/destroy/destroyAllForConnection`
- `frontend/src/services/__tests__/machine-registry.test.ts` — unit tests
- `frontend/src/services/gateway-service.ts` — `login/signup/logout/fetchRegistrationStatus/startMachineListWs/stopMachineListWs/loadPersistedSession`
- `frontend/src/services/__tests__/gateway-service.test.ts` — unit tests

### Modify
- `frontend/src/stores/connection-store.ts` — add `GatewayState`, `machineSecrets`, `persist` middleware, fine-grained setters, rewrite actions
- `frontend/src/lib/connections/gatewayNode.ts` — dual-write phase, then deleted
- `frontend/src/lib/connections/gatewayConnection.ts` — swap `E2EEManager.getInstance().getContentPublicKey` call (line 189-190) for direct import of `getContentPublicKey`
- `frontend/src/lib/connections/index.ts` — drop `GatewayNode` export
- `frontend/src/lib/e2ee/index.ts` — drop `E2EEManager` export, add `getContentPublicKey` from `pairing.ts`
- `frontend/src/components/tabs/GatewayShell.tsx` — prop → selector
- `frontend/src/components/tabs/GatewayHomeTab.tsx` — prop → selector
- `frontend/src/components/tabs/GatewayLoginScreen.tsx` — prop → selector
- `frontend/src/components/tabs/MachinePairingForm.tsx` — prop → selector
- `frontend/src/components/tabs/HomeTab.tsx` (`GatewayNodeView` subcomponent) — prop → selector
- `frontend/src/stores/__tests__/connection-store-gateway.test.ts` — extend for new behavior

### Delete
- `frontend/src/lib/connections/gatewayNode.ts`
- `frontend/src/lib/e2ee/manager.ts`

---

## Phase 1: Foundation — types + persist + pair action

### Task 1.1: Add `GatewayState` interface and new `ConnectionNode` fields

**Files:**
- Modify: `frontend/src/stores/connection-store.ts:55-59`

- [ ] **Step 1: Edit `ConnectionNode` and add `GatewayState`**

Replace lines 53-66 of `frontend/src/stores/connection-store.ts`:

```ts
// -- Store types --

export interface GatewayState {
  session: GatewaySession | null;
  machines: MachineStatus[];
  registrationOpen: boolean | null;
  authError: string | null;
  authLoading: boolean;
}

export const EMPTY_GATEWAY_STATE: GatewayState = {
  session: null,
  machines: [],
  registrationOpen: null,
  authError: null,
  authLoading: false,
};

interface ConnectionNode {
  entry: ConnectionEntryPersisted;
  directConn?: DirectConnection;
  gatewayNode?: GatewayNode;     // legacy, removed in Phase 6
  gatewayUrl?: string;           // constant, set at creation (gateway type only)
  gatewayState?: GatewayState;   // new: reactive plain data
}

export interface ConnectionStoreState {
  nodes: ConnectionNode[];
  tabs: TabPersisted[];
  activeTabId: string;
  initialized: boolean;
  machineSecrets: Record<string, string>; // machineId -> base64 master secret
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS (some actions may now complain about missing `machineSecrets` initializer — that's fixed in Task 1.2).

If the typecheck errors only concern `machineSecrets` initializer missing in the `create(...)` call, that is expected. If anything else errors, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/connection-store.ts
git commit -m "refactor(gateway-state): add GatewayState slice type + machineSecrets field"
```

---

### Task 1.2: Add `persist` middleware + `machineSecrets` + `pairMachine`/`unpairMachine` actions

**Files:**
- Modify: `frontend/src/stores/connection-store.ts` (top of file + create() call + interface)

- [ ] **Step 1: Update imports**

At the top of `frontend/src/stores/connection-store.ts` (line 2), replace:

```ts
import { create } from 'zustand';
```

with:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
```

- [ ] **Step 2: Update `ConnectionStoreActions` interface**

In `frontend/src/stores/connection-store.ts`, find the `pairMachine` / `unpairMachine` entries (around lines 85-90):

```ts
  pairMachine(
    connectionId: string,
    machineId: string,
    base64Secret: string
  ): void;
  unpairMachine(connectionId: string, machineId: string): void;
```

Replace with the global-scope form (connectionId removed — `machineSecrets` is global):

```ts
  pairMachine(machineId: string, base64Secret: string): void;
  unpairMachine(machineId: string): void;
  pairMachineLegacy(
    connectionId: string,
    machineId: string,
    base64Secret: string
  ): void;
  unpairMachineLegacy(connectionId: string, machineId: string): void;
```

The `*Legacy` variants stay temporarily so existing component code keeps compiling. They are removed in Phase 6.

- [ ] **Step 3: Wrap `create` in `persist`**

Locate line 117 in `connection-store.ts`:

```ts
export const useConnectionStore = create<ConnectionStore>((set, get) => ({
```

Replace it (and the closing `}));` at the very end of the store object) with:

```ts
export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
```

And change the closing `}));` at the end of the `create()` call to:

```ts
    }),
    {
      name: 'vb_connection_store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ machineSecrets: state.machineSecrets }),
    }
  )
);
```

- [ ] **Step 4: Add `machineSecrets` initial value and new actions**

In the `create(...)` callback, right after `initialized: false,` (line 121), insert:

```ts
    machineSecrets: {},

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
```

Also rename the existing `pairMachine(connectionId, machineId, base64Secret)` method and its `unpairMachine(connectionId, machineId)` sibling (around lines 274-287) to `pairMachineLegacy` / `unpairMachineLegacy`. Leave their bodies unchanged for now.

- [ ] **Step 5: Extend existing test to verify persist**

Edit `frontend/src/stores/__tests__/connection-store-gateway.test.ts`. At the end of the file (before the final `});`), add:

```ts
  it('persists machineSecrets to localStorage via persist middleware', async () => {
    const { useConnectionStore } = await import('../connection-store');
    useConnectionStore.getState().pairMachine('m-abc', 'secret123');
    const raw = localStorage.getItem('vb_connection_store');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.machineSecrets).toEqual({ 'm-abc': 'secret123' });
  });

  it('unpairMachine removes from machineSecrets', async () => {
    const { useConnectionStore } = await import('../connection-store');
    useConnectionStore.getState().pairMachine('m-abc', 'secret123');
    useConnectionStore.getState().pairMachine('m-xyz', 'secret456');
    useConnectionStore.getState().unpairMachine('m-abc');
    const { machineSecrets } = useConnectionStore.getState();
    expect(machineSecrets).toEqual({ 'm-xyz': 'secret456' });
  });
```

- [ ] **Step 6: Run tests**

Run: `cd frontend && ./node_modules/.bin/vitest run src/stores/__tests__/connection-store-gateway.test.ts`
Expected: PASS (all tests including the 2 new ones).

- [ ] **Step 7: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/connection-store.ts frontend/src/stores/__tests__/connection-store-gateway.test.ts
git commit -m "feat(gateway-state): add persist middleware + machineSecrets + pairMachine actions"
```

---

### Task 1.3: Flip `MachinePairingForm` to use new global `pairMachine`

**Files:**
- Modify: `frontend/src/components/tabs/MachinePairingForm.tsx:59`

- [ ] **Step 1: Change `pairMachine` call**

In `frontend/src/components/tabs/MachinePairingForm.tsx`, find line 59:

```tsx
      pairMachine(gwNode.connectionId, machineId, trimmed);
```

Replace with:

```tsx
      pairMachine(machineId, trimmed);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS (because `pairMachine` in the store now takes `(machineId, secret)`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/MachinePairingForm.tsx
git commit -m "refactor(gateway-ui): MachinePairingForm uses global pairMachine(machineId, secret)"
```

---

### Task 1.4: Flip `MachineRow.isPaired` to use store selector

**Files:**
- Modify: `frontend/src/components/tabs/GatewayHomeTab.tsx:66`

- [ ] **Step 1: Replace `isMachinePaired()` call with selector**

In `frontend/src/components/tabs/GatewayHomeTab.tsx`, find the `MachineRow` function. Replace line 66:

```tsx
  const isPaired = gwNode.isMachinePaired(machine.machine_id);
```

With (add `useConnectionStore` import if not present — it is):

```tsx
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );
```

- [ ] **Step 2: Same change in `HomeTab.tsx` for tauri mode**

In `frontend/src/components/tabs/HomeTab.tsx:326`, replace:

```tsx
  const isPaired = gatewayNode.isMachinePaired(machine.machine_id);
```

With:

```tsx
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );
```

Ensure `useConnectionStore` is imported at the top of that file.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tabs/GatewayHomeTab.tsx frontend/src/components/tabs/HomeTab.tsx
git commit -m "refactor(gateway-ui): MachineRow.isPaired reads from store.machineSecrets"
```

---

## Phase 2: New service modules

### Task 2.1: Create `e2ee/pairing.ts` with `getContentPublicKey` + tests

**Files:**
- Create: `frontend/src/lib/e2ee/pairing.ts`
- Create: `frontend/src/lib/e2ee/__tests__/pairing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/e2ee/__tests__/pairing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/appMode', () => ({
  isLocalDirect: false,
  isGateway: true,
  isTauri: false,
  appMode: 'gateway',
}));
vi.mock('@/stores/migration', () => ({ runMigrationIfNeeded: vi.fn() }));

describe('e2ee/pairing.getContentPublicKey', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
  });

  it('returns null when machine has no secret', async () => {
    const { getContentPublicKey } = await import('../pairing');
    expect(getContentPublicKey('m-unknown')).toBeNull();
  });

  it('returns a 32-byte public key after pairing', async () => {
    const { useConnectionStore } = await import('@/stores/connection-store');
    const { getContentPublicKey } = await import('../pairing');
    // 32 bytes of deterministic secret, base64-encoded
    const secret = btoa(String.fromCharCode(...new Array(32).fill(7)));
    useConnectionStore.getState().pairMachine('m-test', secret);
    const pk = getContentPublicKey('m-test');
    expect(pk).toBeInstanceOf(Uint8Array);
    expect(pk!.length).toBe(32);
  });

  it('caches derived keypair across calls (same reference)', async () => {
    const { useConnectionStore } = await import('@/stores/connection-store');
    const { getContentPublicKey } = await import('../pairing');
    const secret = btoa(String.fromCharCode(...new Array(32).fill(3)));
    useConnectionStore.getState().pairMachine('m-cached', secret);
    const pk1 = getContentPublicKey('m-cached');
    const pk2 = getContentPublicKey('m-cached');
    expect(pk1).toBe(pk2);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `cd frontend && ./node_modules/.bin/vitest run src/lib/e2ee/__tests__/pairing.test.ts`
Expected: FAIL with module resolution error `Cannot find module '../pairing'`.

- [ ] **Step 3: Create the implementation**

Create `frontend/src/lib/e2ee/pairing.ts`:

```ts
import { deriveContentKeyPair, type ContentKeyPair } from './keys';
import { useConnectionStore } from '@/stores/connection-store';

// base64Secret -> derived keypair. Derivation is CPU-bound (Ed25519 -> X25519);
// the same secret always derives the same keypair, so caching by secret is correct.
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

- [ ] **Step 4: Run the test — expect pass**

Run: `cd frontend && ./node_modules/.bin/vitest run src/lib/e2ee/__tests__/pairing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/e2ee/pairing.ts frontend/src/lib/e2ee/__tests__/pairing.test.ts
git commit -m "feat(e2ee): add stateless pairing.getContentPublicKey helper"
```

---

### Task 2.2: Create `services/machine-registry.ts` + tests

**Files:**
- Create: `frontend/src/services/machine-registry.ts`
- Create: `frontend/src/services/__tests__/machine-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/services/__tests__/machine-registry.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const disconnectSpies: Array<() => void> = [];

vi.mock('@/lib/connections/gatewayConnection', () => ({
  GatewayMachineConnection: class {
    disconnect = vi.fn(() => {
      disconnectSpies.push(() => {});
    });
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
}));

describe('machine-registry', () => {
  beforeEach(() => {
    vi.resetModules();
    disconnectSpies.length = 0;
  });

  afterEach(() => {
    disconnectSpies.length = 0;
  });

  it('getOrCreate returns the same instance across calls', async () => {
    const reg = await import('../machine-registry');
    const session = { sessionToken: 't', userId: 'u' };
    const a = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'host1');
    const b = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'host1');
    expect(a).toBe(b);
  });

  it('destroy removes instance and calls disconnect', async () => {
    const reg = await import('../machine-registry');
    const session = { sessionToken: 't', userId: 'u' };
    const c = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'host1') as any;
    reg.destroy('c1', 'm1');
    expect(c.disconnect).toHaveBeenCalledOnce();
    const d = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'host1');
    expect(d).not.toBe(c);
  });

  it('destroyAllForConnection removes only entries matching that connId', async () => {
    const reg = await import('../machine-registry');
    const session = { sessionToken: 't', userId: 'u' };
    const c1m1 = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'h1') as any;
    const c1m2 = reg.getOrCreate('c1', 'm2', 'https://gw', session, 'h2') as any;
    const c2m1 = reg.getOrCreate('c2', 'm1', 'https://gw', session, 'h3') as any;
    reg.destroyAllForConnection('c1');
    expect(c1m1.disconnect).toHaveBeenCalledOnce();
    expect(c1m2.disconnect).toHaveBeenCalledOnce();
    expect(c2m1.disconnect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `cd frontend && ./node_modules/.bin/vitest run src/services/__tests__/machine-registry.test.ts`
Expected: FAIL with `Cannot find module '../machine-registry'`.

- [ ] **Step 3: Create implementation**

Create `frontend/src/services/machine-registry.ts`:

```ts
import { GatewayMachineConnection } from '@/lib/connections/gatewayConnection';
import type { GatewaySession } from '@/lib/connections/types';

const connections = new Map<string, GatewayMachineConnection>();
const keyOf = (connId: string, machineId: string) => `${connId}:${machineId}`;

export function getOrCreate(
  connId: string,
  machineId: string,
  gatewayUrl: string,
  session: GatewaySession,
  label: string
): GatewayMachineConnection {
  const k = keyOf(connId, machineId);
  let c = connections.get(k);
  if (!c) {
    c = new GatewayMachineConnection(
      `${connId}:${machineId}`,
      gatewayUrl,
      label,
      gatewayUrl,
      session,
      machineId
    );
    connections.set(k, c);
  }
  return c;
}

export function destroy(connId: string, machineId: string): void {
  const k = keyOf(connId, machineId);
  const c = connections.get(k);
  if (c) {
    c.disconnect();
    connections.delete(k);
  }
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

- [ ] **Step 4: Run test — expect pass**

Run: `cd frontend && ./node_modules/.bin/vitest run src/services/__tests__/machine-registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/machine-registry.ts frontend/src/services/__tests__/machine-registry.test.ts
git commit -m "feat(services): add machine-registry with explicit lifecycle"
```

---

### Task 2.3: Create `gateway-service.ts` — auth + registration status + tests

**Files:**
- Create: `frontend/src/services/gateway-service.ts`
- Create: `frontend/src/services/__tests__/gateway-service.test.ts`

- [ ] **Step 1: Add fine-grained slice setters to the store (prerequisite)**

In `frontend/src/stores/connection-store.ts`, add to `ConnectionStoreActions` interface (right after `machineSecrets` field):

```ts
  setGatewayField: <K extends keyof GatewayState>(
    connectionId: string,
    key: K,
    value: GatewayState[K]
  ) => void;
  setMachines: (connectionId: string, machines: MachineStatus[]) => void;
  upsertMachine: (connectionId: string, machine: MachineStatus) => void;
  removeMachine: (connectionId: string, machineId: string) => void;
```

In the `create(...)` callback, immediately after `unpairMachine`, insert:

```ts
    setGatewayField(connectionId, key, value) {
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.entry.id === connectionId && n.gatewayState
            ? { ...n, gatewayState: { ...n.gatewayState, [key]: value } }
            : n
        ),
      }));
    },
    setMachines(connectionId, machines) {
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.entry.id === connectionId && n.gatewayState
            ? { ...n, gatewayState: { ...n.gatewayState, machines } }
            : n
        ),
      }));
    },
    upsertMachine(connectionId, machine) {
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.entry.id !== connectionId || !n.gatewayState) return n;
          const existing = n.gatewayState.machines.findIndex(
            (m) => m.machine_id === machine.machine_id
          );
          const machines =
            existing >= 0
              ? n.gatewayState.machines.map((m, i) => (i === existing ? machine : m))
              : [...n.gatewayState.machines, machine];
          return { ...n, gatewayState: { ...n.gatewayState, machines } };
        }),
      }));
    },
    removeMachine(connectionId, machineId) {
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.entry.id === connectionId && n.gatewayState
            ? {
                ...n,
                gatewayState: {
                  ...n.gatewayState,
                  machines: n.gatewayState.machines.filter(
                    (m) => m.machine_id !== machineId
                  ),
                },
              }
            : n
        ),
      }));
    },
```

Also initialize `gatewayState` and `gatewayUrl` when creating gateway nodes in `init()` and `addConnection()` / `updateConnectionUrl`. Find line 164 inside init's `entries.map`:

```ts
        const node = new GatewayNode(entry.id, entry.url);
        node.loadSession();
        node.fetchRegistrationStatus();
        node.onChange(() => set((s) => ({ nodes: [...s.nodes] })));
        if (node.session) {
          node.startMachineListWs();
        }
        return { entry, gatewayNode: node };
```

Replace with:

```ts
        const node = new GatewayNode(entry.id, entry.url);
        node.loadSession();
        node.fetchRegistrationStatus();
        node.onChange(() => set((s) => ({ nodes: [...s.nodes] })));
        if (node.session) {
          node.startMachineListWs();
        }
        return {
          entry,
          gatewayNode: node,
          gatewayUrl: entry.url,
          gatewayState: {
            ...EMPTY_GATEWAY_STATE,
            session: node.session,
          },
        };
```

Apply the same `gatewayUrl` + `gatewayState: { ...EMPTY_GATEWAY_STATE }` additions in `addConnection()` (around line 186) and `updateConnectionUrl()` (around line 234). For both, the gateway-type branch should return `{ entry, gatewayNode, gatewayUrl: url, gatewayState: { ...EMPTY_GATEWAY_STATE } }` (no `node.session` since those paths have no session yet).

- [ ] **Step 2: Typecheck prerequisite**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Write the failing service test**

Create `frontend/src/services/__tests__/gateway-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/appMode', () => ({
  isLocalDirect: false,
  isGateway: true,
  isTauri: false,
  appMode: 'gateway',
}));
vi.mock('@/stores/migration', () => ({ runMigrationIfNeeded: vi.fn() }));

describe('gateway-service.fetchRegistrationStatus', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it('writes registrationOpen=true into the store on 200', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { fetchRegistrationStatus } = await import('../gateway-service');

    useConnectionStore.getState().init();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ open: true }),
    })) as any;

    await fetchRegistrationStatus(GATEWAY_SELF_ID, 'https://gw.example');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.registrationOpen).toBe(true);
  });

  it('writes registrationOpen=false on fetch throw', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { fetchRegistrationStatus } = await import('../gateway-service');
    useConnectionStore.getState().init();

    globalThis.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as any;

    await fetchRegistrationStatus(GATEWAY_SELF_ID, 'https://gw.example');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.registrationOpen).toBe(false);
  });
});

describe('gateway-service.login', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it('on success sets session, persists it, and clears authLoading', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { login } = await import('../gateway-service');

    useConnectionStore.getState().init();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '',
      json: async () => ({ token: 'abc', user_id: 'u-1' }),
    })) as any;
    // Do NOT actually open a real WebSocket in the test
    globalThis.WebSocket = class {
      onopen = null;
      onmessage = null;
      onclose = null;
      onerror = null;
      close() {}
      send() {}
    } as any;

    await login(GATEWAY_SELF_ID, 'https://gw.example', 'a@b', 'pw');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.session).toEqual({
      sessionToken: 'abc',
      userId: 'u-1',
    });
    expect(node.gatewayState!.authLoading).toBe(false);
    expect(localStorage.getItem(`vb_gateway_session_${GATEWAY_SELF_ID}`)).toBeTruthy();
  });

  it('on failure sets authError and clears authLoading', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { login } = await import('../gateway-service');

    useConnectionStore.getState().init();
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Invalid credentials',
      json: async () => ({}),
    })) as any;

    await login(GATEWAY_SELF_ID, 'https://gw.example', 'a@b', 'pw');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.session).toBeNull();
    expect(node.gatewayState!.authLoading).toBe(false);
    expect(node.gatewayState!.authError).toBe('Invalid credentials');
  });
});
```

- [ ] **Step 4: Run test — expect failure**

Run: `cd frontend && ./node_modules/.bin/vitest run src/services/__tests__/gateway-service.test.ts`
Expected: FAIL with `Cannot find module '../gateway-service'`.

- [ ] **Step 5: Create implementation (partial — just auth + registration)**

Create `frontend/src/services/gateway-service.ts`:

```ts
import { useConnectionStore } from '@/stores/connection-store';
import type { GatewaySession } from '@/lib/connections/types';

// --- Session persistence (per connection) ---
export function loadPersistedSession(
  connectionId: string
): GatewaySession | null {
  try {
    const raw = localStorage.getItem(`vb_gateway_session_${connectionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(
  connectionId: string,
  session: GatewaySession | null
): void {
  const key = `vb_gateway_session_${connectionId}`;
  if (session) localStorage.setItem(key, JSON.stringify(session));
  else localStorage.removeItem(key);
}

// --- Auth ---
export async function login(
  connectionId: string,
  gatewayUrl: string,
  email: string,
  password: string
): Promise<void> {
  const store = useConnectionStore.getState();
  store.setGatewayField(connectionId, 'authLoading', true);
  store.setGatewayField(connectionId, 'authError', null);

  try {
    const resp = await fetch(`${gatewayUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `Login failed (${resp.status})`);
    }
    const { token, user_id } = await resp.json();
    const session: GatewaySession = { sessionToken: token, userId: user_id };
    persistSession(connectionId, session);

    const s = useConnectionStore.getState();
    s.setGatewayField(connectionId, 'session', session);
    s.setGatewayField(connectionId, 'authLoading', false);
    startMachineListWs(connectionId, gatewayUrl, session);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Login failed';
    const s = useConnectionStore.getState();
    s.setGatewayField(connectionId, 'authError', message);
    s.setGatewayField(connectionId, 'authLoading', false);
  }
}

export async function signup(
  connectionId: string,
  gatewayUrl: string,
  email: string,
  password: string,
  name?: string
): Promise<void> {
  const store = useConnectionStore.getState();
  store.setGatewayField(connectionId, 'authLoading', true);
  store.setGatewayField(connectionId, 'authError', null);

  try {
    const resp = await fetch(`${gatewayUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `Signup failed (${resp.status})`);
    }
    const { token, user_id } = await resp.json();
    const session: GatewaySession = { sessionToken: token, userId: user_id };
    persistSession(connectionId, session);

    const s = useConnectionStore.getState();
    s.setGatewayField(connectionId, 'session', session);
    s.setGatewayField(connectionId, 'authLoading', false);
    startMachineListWs(connectionId, gatewayUrl, session);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Signup failed';
    const s = useConnectionStore.getState();
    s.setGatewayField(connectionId, 'authError', message);
    s.setGatewayField(connectionId, 'authLoading', false);
  }
}

// --- Registration status ---
export async function fetchRegistrationStatus(
  connectionId: string,
  gatewayUrl: string
): Promise<void> {
  const store = useConnectionStore.getState();
  try {
    const resp = await fetch(`${gatewayUrl}/api/auth/registration-status`);
    const { open } = await resp.json();
    store.setGatewayField(connectionId, 'registrationOpen', open);
  } catch {
    store.setGatewayField(connectionId, 'registrationOpen', false);
  }
}

// --- Machine list WS (filled in next task) ---
export function startMachineListWs(
  _connectionId: string,
  _gatewayUrl: string,
  _session: GatewaySession
): void {
  // Implemented in Task 2.4
}

export function stopMachineListWs(_connectionId: string): void {
  // Implemented in Task 2.4
}

export function logout(_connectionId: string): void {
  // Implemented in Task 2.4
}
```

- [ ] **Step 6: Run test — expect pass**

Run: `cd frontend && ./node_modules/.bin/vitest run src/services/__tests__/gateway-service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/connection-store.ts frontend/src/services/gateway-service.ts frontend/src/services/__tests__/gateway-service.test.ts
git commit -m "feat(services): add gateway-service auth + registration status"
```

---

### Task 2.4: Extend `gateway-service.ts` with WS lifecycle + logout

**Files:**
- Modify: `frontend/src/services/gateway-service.ts`
- Modify: `frontend/src/services/__tests__/gateway-service.test.ts`

- [ ] **Step 1: Write failing tests for WS handling + logout**

In `frontend/src/services/__tests__/gateway-service.test.ts`, at the bottom add:

```ts
describe('gateway-service.startMachineListWs', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it("dispatches setMachines on an incoming 'machines' frame", async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');

    useConnectionStore.getState().init();

    let wsInstance: any;
    globalThis.WebSocket = class {
      onopen: any = null;
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      url: string;
      constructor(url: string) {
        this.url = url;
        wsInstance = this;
      }
      close() {
        this.onclose?.({});
      }
      send() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });

    // Simulate server frame
    wsInstance.onmessage({
      data: JSON.stringify({
        type: 'machines',
        machines: [
          { machine_id: 'm1', hostname: 'h', platform: 'linux', port: 1234 },
        ],
      }),
    });

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.machines).toHaveLength(1);
    expect(node.gatewayState!.machines[0].machine_id).toBe('m1');
  });

  it("dispatches upsertMachine on 'machine_online' frame", async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');
    useConnectionStore.getState().init();

    let wsInstance: any;
    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      constructor() {
        wsInstance = this;
      }
      close() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });

    wsInstance.onmessage({
      data: JSON.stringify({
        type: 'machine_online',
        machine_id: 'm2',
        hostname: 'h2',
        platform: 'darwin',
        port: 9999,
      }),
    });

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.machines).toHaveLength(1);
    expect(node.gatewayState!.machines[0].machine_id).toBe('m2');
  });

  it("removes machine on 'machine_offline' frame", async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');
    useConnectionStore.getState().init();

    let wsInstance: any;
    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      constructor() {
        wsInstance = this;
      }
      close() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });

    wsInstance.onmessage({
      data: JSON.stringify({
        type: 'machines',
        machines: [
          { machine_id: 'm1', hostname: '', platform: '', port: 0 },
        ],
      }),
    });
    wsInstance.onmessage({
      data: JSON.stringify({ type: 'machine_offline', machine_id: 'm1' }),
    });

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.machines).toHaveLength(0);
  });

  it('is idempotent: second call is a no-op if a socket is already open', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');
    useConnectionStore.getState().init();

    const wsSpy = vi.fn();
    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      constructor(url: string) {
        wsSpy(url);
      }
      close() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });
    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });
    expect(wsSpy).toHaveBeenCalledOnce();
  });
});

describe('gateway-service.logout', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it('clears session, removes persisted session, empties machines', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { logout } = await import('../gateway-service');

    useConnectionStore.getState().init();
    useConnectionStore.getState().setGatewayField(GATEWAY_SELF_ID, 'session', {
      sessionToken: 't',
      userId: 'u',
    });
    useConnectionStore.getState().setMachines(GATEWAY_SELF_ID, [
      { machine_id: 'm1', hostname: '', platform: '', port: 0 },
    ]);
    localStorage.setItem(
      `vb_gateway_session_${GATEWAY_SELF_ID}`,
      JSON.stringify({ sessionToken: 't', userId: 'u' })
    );

    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      close() {}
    } as any;

    logout(GATEWAY_SELF_ID);

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.session).toBeNull();
    expect(node.gatewayState!.machines).toEqual([]);
    expect(localStorage.getItem(`vb_gateway_session_${GATEWAY_SELF_ID}`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `cd frontend && ./node_modules/.bin/vitest run src/services/__tests__/gateway-service.test.ts`
Expected: FAIL on the new tests (WS stubs in service are no-op placeholders from Task 2.3).

- [ ] **Step 3: Fill in WS + logout in `gateway-service.ts`**

In `frontend/src/services/gateway-service.ts`, add this top-level declaration (just after imports):

```ts
import type { MachineStatus } from '@/lib/e2ee';
import * as machineRegistry from './machine-registry';

const machineListSockets = new Map<string, WebSocket>();
```

Replace the stub `startMachineListWs`, `stopMachineListWs`, and `logout` with real implementations:

```ts
export function startMachineListWs(
  connectionId: string,
  gatewayUrl: string,
  session: GatewaySession
): void {
  if (machineListSockets.has(connectionId)) return;

  const wsUrl = gatewayUrl
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');
  const ws = new WebSocket(
    `${wsUrl}/ws/webui?token=${encodeURIComponent(session.sessionToken)}`
  );

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      const store = useConnectionStore.getState();
      switch (msg.type) {
        case 'auth_ok':
          break;
        case 'auth_error':
          logout(connectionId);
          break;
        case 'machines':
          store.setMachines(connectionId, msg.machines as MachineStatus[]);
          break;
        case 'machine_online':
          store.upsertMachine(connectionId, {
            machine_id: msg.machine_id,
            hostname: msg.hostname ?? '',
            platform: msg.platform ?? '',
            port: msg.port ?? 0,
          });
          break;
        case 'machine_offline':
          store.removeMachine(connectionId, msg.machine_id);
          break;
      }
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    machineListSockets.delete(connectionId);
  };
  ws.onerror = () => {
    console.warn(`[gateway-service] WS error for ${connectionId}`);
  };

  machineListSockets.set(connectionId, ws);
}

export function stopMachineListWs(connectionId: string): void {
  const ws = machineListSockets.get(connectionId);
  if (!ws) return;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.close();
  machineListSockets.delete(connectionId);
}

export function logout(connectionId: string): void {
  stopMachineListWs(connectionId);
  machineRegistry.destroyAllForConnection(connectionId);
  persistSession(connectionId, null);
  const s = useConnectionStore.getState();
  s.setGatewayField(connectionId, 'session', null);
  s.setMachines(connectionId, []);
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `cd frontend && ./node_modules/.bin/vitest run src/services/__tests__/gateway-service.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/gateway-service.ts frontend/src/services/__tests__/gateway-service.test.ts
git commit -m "feat(services): implement WS lifecycle + logout in gateway-service"
```

---

## Phase 3: Dual-write — keep components on old path but also populate slice

### Task 3.1: Hook `GatewayNode` field mutations into store slice

**Files:**
- Modify: `frontend/src/lib/connections/gatewayNode.ts`

Strategy: every place `GatewayNode` mutates a reactive field (session/machines/registrationOpen/authError/authLoading), also dispatch the corresponding store setter. This keeps the new slice synchronized with the class instance during Phase 4 component flips.

- [ ] **Step 1: Inject store access into `GatewayNode`**

At the top of `frontend/src/lib/connections/gatewayNode.ts`, add import:

```ts
import { useConnectionStore } from '@/stores/connection-store';
```

Then at every `this.session = ...`, `this.machines = ...`, `this.registrationOpen = ...`, `this.authError = ...`, `this.authLoading = ...` call site, follow it with a corresponding `useConnectionStore.getState().setGatewayField(this.connectionId, 'X', value)` or `setMachines` call.

Specifically, make these edits:

1. In `login()` around line 61, after `this.authLoading = true; this.authError = null;`:
   Add:
   ```ts
       const store = useConnectionStore.getState();
       store.setGatewayField(this.connectionId, 'authLoading', true);
       store.setGatewayField(this.connectionId, 'authError', null);
   ```

2. After `this.session = { sessionToken: data.token, userId: data.user_id };`:
   Add:
   ```ts
       useConnectionStore
         .getState()
         .setGatewayField(this.connectionId, 'session', this.session);
   ```

3. Inside the `catch` block, after `this.authError = ...;`:
   Add:
   ```ts
       useConnectionStore
         .getState()
         .setGatewayField(this.connectionId, 'authError', this.authError);
   ```

4. In the `finally` block, after `this.authLoading = false;`:
   Add:
   ```ts
       useConnectionStore
         .getState()
         .setGatewayField(this.connectionId, 'authLoading', false);
   ```

5. Apply the same 4-point pattern in `signup()`.

6. In `logout()` after `this.machines = [];`:
   Add:
   ```ts
       const store = useConnectionStore.getState();
       store.setGatewayField(this.connectionId, 'session', null);
       store.setMachines(this.connectionId, []);
   ```

7. In `onmessage` for `'machines'` (line 142-144):
   After `this.machines = msg.machines;`:
   Add:
   ```ts
           useConnectionStore
             .getState()
             .setMachines(this.connectionId, msg.machines);
   ```

8. For `'machine_online'` and `'machine_offline'`: same pattern using `upsertMachine` / `removeMachine`.

9. For `'auth_error'` branch (line 139-141):
   After `this.machines = [];`:
   Add:
   ```ts
           const store = useConnectionStore.getState();
           store.setGatewayField(this.connectionId, 'session', null);
           store.setMachines(this.connectionId, []);
   ```

10. In `fetchRegistrationStatus()` (line 196-198):
    After `this.registrationOpen = data.open;`:
    Add:
    ```ts
        useConnectionStore
          .getState()
          .setGatewayField(this.connectionId, 'registrationOpen', data.open);
    ```
    Same for the catch branch with `false`.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: PASS (nothing broke).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/connections/gatewayNode.ts
git commit -m "refactor(gateway-state): dual-write GatewayNode mutations into store slice"
```

---

## Phase 4: Flip components one at a time

Each component task does the same thing: change the prop from `gwNode: GatewayNode` to `connectionId: string`, read data via Zustand selectors, delete the `[, force] = useState(0); useEffect(onChange)` boilerplate.

### Task 4.1: Flip `GatewayLoginScreen`

**Files:**
- Modify: `frontend/src/components/tabs/GatewayLoginScreen.tsx`

- [ ] **Step 1: Rewrite component signature and state reads**

Read the full file first to match imports.

Run: `cat frontend/src/components/tabs/GatewayLoginScreen.tsx`

Replace the component body so it becomes:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  useConnectionStore,
  EMPTY_GATEWAY_STATE,
} from '@/stores/connection-store';

export function GatewayLoginScreen({
  connectionId,
}: {
  connectionId: string;
}) {
  const gatewayState = useConnectionStore(
    (s) =>
      s.nodes.find((n) => n.entry.id === connectionId)?.gatewayState ??
      EMPTY_GATEWAY_STATE
  );
  const gatewayUrl = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === connectionId)?.gatewayUrl ?? ''
  );
  const loginConnection = useConnectionStore((s) => s.loginConnection);
  const signupConnection = useConnectionStore((s) => s.signupConnection);
  // fetchRegistrationStatus is an internal service call — trigger via a thin
  // action that delegates. Wired up in Phase 5; for now, call via GatewayNode:
  const fetchViaGwNode = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === connectionId)?.gatewayNode
  );

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    fetchViaGwNode?.fetchRegistrationStatus();
  }, [fetchViaGwNode]);

  const { registrationOpen, authError, authLoading } = gatewayState;

  const handleSubmit = useCallback(async () => {
    if (isSignup) {
      await signupConnection(connectionId, email, password, name || undefined);
    } else {
      await loginConnection(connectionId, email, password);
    }
  }, [isSignup, signupConnection, loginConnection, connectionId, email, password, name]);

  // ... keep the existing JSX body unchanged, referencing the destructured
  // registrationOpen/authError/authLoading variables
  // (Replace each `gwNode.connectionId` with `connectionId` if any remains.)
}
```

Retain the existing JSX (login/signup form) from the original file — only update the references so `gwNode.connectionId` → `connectionId`, and remove any leftover `const [, force] = useState(0)` and `useEffect(() => gwNode.onChange(...))` lines.

- [ ] **Step 2: Update `<GatewayLoginScreen>` call sites**

Search for the one call site. Run:

```bash
grep -rn 'GatewayLoginScreen' frontend/src/
```

Expected: only `frontend/src/components/tabs/GatewayShell.tsx:62`. Update that line from:

```tsx
    return <GatewayLoginScreen gwNode={gwNode} />;
```

to:

```tsx
    return <GatewayLoginScreen connectionId={GATEWAY_SELF_ID} />;
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tabs/GatewayLoginScreen.tsx frontend/src/components/tabs/GatewayShell.tsx
git commit -m "refactor(gateway-ui): GatewayLoginScreen reads state via Zustand selectors"
```

---

### Task 4.2: Flip `GatewayHomeTab` (and its `MachineRow` subcomponent)

**Files:**
- Modify: `frontend/src/components/tabs/GatewayHomeTab.tsx`

- [ ] **Step 1: Rewrite the file**

Overwrite `frontend/src/components/tabs/GatewayHomeTab.tsx` with:

```tsx
// frontend/src/components/tabs/GatewayHomeTab.tsx
import { useState } from 'react';
import {
  ChevronDown,
  LogOut,
  Wifi,
  WifiOff,
  Monitor,
  AlertCircle,
} from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';
import { MachinePairingForm } from './MachinePairingForm';
import type { MachineStatus } from '@/lib/e2ee';

export function GatewayHomeTab({
  connectionId,
}: {
  connectionId: string;
}) {
  const machines = useConnectionStore(
    (s) =>
      s.nodes.find((n) => n.entry.id === connectionId)?.gatewayState?.machines ??
      []
  );
  const logoutConnection = useConnectionStore((s) => s.logoutConnection);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Machines</h2>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded text-foreground/70 hover:text-foreground"
          onClick={() => logoutConnection(connectionId)}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {machines.length === 0 ? (
        <EmptyMachinesPlaceholder />
      ) : (
        <div className="space-y-2">
          {machines.map((m) => (
            <MachineRow
              key={m.machine_id}
              connectionId={connectionId}
              machine={m}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyMachinesPlaceholder() {
  return (
    <div className="text-center py-12 space-y-2">
      <AlertCircle size={28} className="mx-auto text-foreground/30" />
      <p className="text-sm text-foreground/50">No machines online</p>
      <p className="text-xs text-foreground/40">
        Start a vibe-board CLI on a machine and pair it with this gateway.
      </p>
    </div>
  );
}

function MachineRow({
  connectionId,
  machine,
}: {
  connectionId: string;
  machine: MachineStatus;
}) {
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );
  const openMachineProjectsTab = useConnectionStore(
    (s) => s.openMachineProjectsTab
  );
  const [showPair, setShowPair] = useState(false);
  const label = machine.hostname || machine.machine_id.slice(0, 8);

  const handleClick = () => {
    if (isPaired) {
      openMachineProjectsTab(connectionId, machine.machine_id, label);
    } else {
      setShowPair((v) => !v);
    }
  };

  return (
    <div className="border border-border rounded bg-muted/30">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-foreground/5"
        onClick={handleClick}
      >
        {isPaired ? (
          <Wifi size={16} className="text-green-500 shrink-0" />
        ) : showPair ? (
          <ChevronDown size={16} className="shrink-0" />
        ) : (
          <WifiOff size={16} className="text-foreground/30 shrink-0" />
        )}
        <Monitor size={16} className="text-foreground/50 shrink-0" />
        <span className="text-sm flex-1 truncate">
          {label}
          {machine.port ? `:${machine.port}` : ''}
        </span>
        {!isPaired && (
          <span className="text-xs text-foreground/40">Not paired</span>
        )}
      </div>

      {showPair && !isPaired && (
        <MachinePairingForm
          connectionId={connectionId}
          machineId={machine.machine_id}
          onPaired={() => setShowPair(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `<GatewayHomeTab>` call site in `GatewayShell.tsx`**

In `frontend/src/components/tabs/GatewayShell.tsx:74`, change:

```tsx
          <GatewayHomeTab gwNode={gwNode} />
```

to:

```tsx
          <GatewayHomeTab connectionId={GATEWAY_SELF_ID} />
```

- [ ] **Step 3: Update `MachinePairingForm` to accept `connectionId`**

Open `frontend/src/components/tabs/MachinePairingForm.tsx`. Replace the component signature and internals to not take `gwNode`:

```tsx
import { useState } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { deriveAuthKeyPair } from '@/lib/e2ee';

interface MachinePairingFormProps {
  connectionId: string;
  machineId: string;
  onPaired?: () => void;
}

export function MachinePairingForm({
  connectionId,
  machineId,
  onPaired,
}: MachinePairingFormProps) {
  const session = useConnectionStore(
    (s) =>
      s.nodes.find((n) => n.entry.id === connectionId)?.gatewayState?.session
  );
  const gatewayUrl = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === connectionId)?.gatewayUrl ?? ''
  );
  const pairMachine = useConnectionStore((s) => s.pairMachine);

  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    const trimmed = secret.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      if (!session) throw new Error('Not logged in');
      const secretBytes = Uint8Array.from(atob(trimmed), (c) =>
        c.charCodeAt(0)
      );
      const authKp = await deriveAuthKeyPair(secretBytes);
      const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

      const regResp = await fetch(
        `${gatewayUrl}/api/auth/device/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.sessionToken}`,
          },
          body: JSON.stringify({
            public_key: pubKeyB64,
            device_name: 'WebUI',
          }),
        }
      );
      if (!regResp.ok && regResp.status !== 409) {
        const text = await regResp.text();
        throw new Error(
          `Device registration failed (${regResp.status}): ${text}`
        );
      }

      pairMachine(machineId, trimmed);
      setSecret('');
      onPaired?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-3 pb-3 pl-9 space-y-2">
      <input
        className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded"
        placeholder="Paste master secret from bridge terminal (base64)"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        disabled={loading}
      />
      <p className="text-xs text-foreground/40">
        Copy the master secret from the bridge terminal output.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        className="px-3 py-1 text-sm bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
        onClick={handlePair}
        disabled={!secret.trim() || loading}
      >
        {loading ? 'Registering...' : 'Pair'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tabs/GatewayHomeTab.tsx frontend/src/components/tabs/GatewayShell.tsx frontend/src/components/tabs/MachinePairingForm.tsx
git commit -m "refactor(gateway-ui): GatewayHomeTab + MachinePairingForm read via selectors"
```

---

### Task 4.3: Flip `GatewayShell`

**Files:**
- Modify: `frontend/src/components/tabs/GatewayShell.tsx`

- [ ] **Step 1: Delete `force` boilerplate, derive session via selector**

Open `frontend/src/components/tabs/GatewayShell.tsx`. Replace the whole top of the file down through the end of the Loading/Login branch with:

```tsx
// frontend/src/components/tabs/GatewayShell.tsx
import { useEffect } from 'react';
import {
  GATEWAY_SELF_ID,
  useConnectionStore,
} from '@/stores/connection-store';
import { TabBar } from './TabBar';
import { GatewayHomeTab } from './GatewayHomeTab';
import { GatewayLoginScreen } from './GatewayLoginScreen';
import { ProjectTab } from './ProjectTab';
import { MachineProjectsTab } from './MachineProjectsTab';

export function GatewayShell() {
  const { initialized, init, tabs, activeTabId, closeTab, setActiveTab } =
    useConnectionStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx === 0) setActiveTab('home');
        else {
          const tab = tabs[idx - 1];
          if (tab) setActiveTab(tab.id);
        }
      }
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

  const sessionExists = useConnectionStore(
    (s) =>
      !!s.nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)?.gatewayState
        ?.session
  );

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!sessionExists) {
    return <GatewayLoginScreen connectionId={GATEWAY_SELF_ID} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        <div
          className={`h-full overflow-auto ${
            activeTabId === 'home' ? '' : 'hidden'
          }`}
        >
          <GatewayHomeTab connectionId={GATEWAY_SELF_ID} />
        </div>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${
              activeTabId === tab.id ? '' : 'hidden'
            }`}
          >
            {tab.type === 'machine-projects' ? (
              <MachineProjectsTab tab={tab} />
            ) : (
              <ProjectTab tab={tab} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/GatewayShell.tsx
git commit -m "refactor(gateway-ui): GatewayShell reads session via selector, drops force hack"
```

---

### Task 4.4: Flip tauri-mode `GatewayNodeView` in `HomeTab.tsx`

**Files:**
- Modify: `frontend/src/components/tabs/HomeTab.tsx`

- [ ] **Step 1: Replace `GatewayNodeView` component**

In `frontend/src/components/tabs/HomeTab.tsx`, find `function GatewayNodeView({ node }: { node: ... })` (around line 122). Replace the component with:

```tsx
function GatewayNodeView({
  node,
}: {
  node: {
    entry: { id: string };
    gatewayNode?: GatewayNode;
  };
}) {
  const connectionId = node.entry.id;
  const gatewayState = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === connectionId)?.gatewayState
  );
  const isLoggedIn = !!gatewayState?.session;

  if (!gatewayState) return null;

  return isLoggedIn ? (
    <GatewayNodeLoggedInView
      connectionId={connectionId}
      machines={gatewayState.machines}
    />
  ) : (
    <GatewayNodeLoggedOutView
      connectionId={connectionId}
      registrationOpen={gatewayState.registrationOpen}
      authError={gatewayState.authError}
      authLoading={gatewayState.authLoading}
    />
  );
}
```

If the original rendered inline instead of split subcomponents, keep the original JSX intact but replace `gwNode.session` → `gatewayState.session`, `gwNode.machines` → `gatewayState.machines`, etc. The key changes are:

1. Drop `const gwNode = node.gatewayNode;` and any `useEffect(() => gwNode.onChange(() => setTick(t=>t+1)))`.
2. Read all of `session / machines / registrationOpen / authError / authLoading` from the `gatewayState` selector.
3. In the `MachineRow`-like subcomponent (line 318+), replace `gatewayNode.isMachinePaired(machine.machine_id)` with `useConnectionStore((s) => machine.machine_id in s.machineSecrets)`.
4. Replace `openMachineProjectsTab(gatewayNode.connectionId, ...)` with `openMachineProjectsTab(connectionId, ...)`.
5. For the pair form include, pass `connectionId={connectionId}` instead of `gwNode={gatewayNode}`.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual verification (both shells)**

Run: `cd frontend && pnpm run dev` (start vite dev)
In the browser, exercise:
- `VITE_APP_MODE=gateway` build path: login → see machine → pair → tab opens.
- `VITE_APP_MODE=tauri` / default path (if using the app directly): multi-connection flow still works.

For a quick smoke without a full rebuild, `pnpm run frontend:check && pnpm run lint` in frontend.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tabs/HomeTab.tsx
git commit -m "refactor(gateway-ui): GatewayNodeView (tauri mode) reads via selectors"
```

---

## Phase 5: Invert delegation — actions call services, drop GatewayNode

### Task 5.1: Rewrite `login/signup/logout/fetchRegistrationStatus` actions

**Files:**
- Modify: `frontend/src/stores/connection-store.ts`

- [ ] **Step 1: Add service imports**

At the top of `frontend/src/stores/connection-store.ts`, add:

```ts
import * as gatewayService from '@/services/gateway-service';
import * as machineRegistry from '@/services/machine-registry';
```

- [ ] **Step 2: Rewrite `loginConnection` action**

Find `loginConnection` (around line 245). Replace its body with:

```ts
  async loginConnection(id, email, password) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayState || !node.gatewayUrl) return;
    await gatewayService.login(id, node.gatewayUrl, email, password);
  },
```

- [ ] **Step 3: Rewrite `signupConnection`**

Find `signupConnection`. Replace body with:

```ts
  async signupConnection(id, email, password, name) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayState || !node.gatewayUrl) return;
    await gatewayService.signup(id, node.gatewayUrl, email, password, name);
  },
```

- [ ] **Step 4: Rewrite `logoutConnection`**

Find `logoutConnection`. Replace body with:

```ts
  logoutConnection(id) {
    gatewayService.logout(id);
    set((s) => {
      const tabs = s.tabs.filter((t) => t.connectionId !== id);
      saveTabs(tabs);
      const activeTabId = tabs.find((t) => t.id === s.activeTabId)
        ? s.activeTabId
        : 'home';
      saveActiveTab(activeTabId);
      return { nodes: [...s.nodes], tabs, activeTabId };
    });
  },
```

- [ ] **Step 5: Populate initial `session` from `loadPersistedSession` in `init`**

In `init()`, inside the entries map (gateway branch), replace the previous `node.loadSession()` path with:

```ts
        const persistedSession = gatewayService.loadPersistedSession(entry.id);
        const node = new GatewayNode(entry.id, entry.url);
        if (persistedSession) node.session = persistedSession;
        node.fetchRegistrationStatus();
        node.onChange(() => set((s) => ({ nodes: [...s.nodes] })));
        if (persistedSession) {
          gatewayService.startMachineListWs(entry.id, entry.url, persistedSession);
        }
        return {
          entry,
          gatewayNode: node,
          gatewayUrl: entry.url,
          gatewayState: { ...EMPTY_GATEWAY_STATE, session: persistedSession },
        };
```

- [ ] **Step 6: `pairMachineLegacy` + `unpairMachineLegacy` become thin wrappers**

Replace their bodies with:

```ts
    pairMachineLegacy(_connectionId, machineId, base64Secret) {
      get().pairMachine(machineId, base64Secret);
    },
    unpairMachineLegacy(_connectionId, machineId) {
      get().unpairMachine(machineId);
    },
```

(These exist only for any lingering callers; they get deleted in Phase 6.)

- [ ] **Step 7: Run full test suite**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/stores/connection-store.ts
git commit -m "refactor(gateway-state): actions delegate to gateway-service"
```

---

### Task 5.2: Switch E2EE consumer from `E2EEManager` to `pairing.getContentPublicKey`

**Files:**
- Modify: `frontend/src/lib/connections/gatewayConnection.ts:189-190`

- [ ] **Step 1: Replace the import and call**

In `frontend/src/lib/connections/gatewayConnection.ts`:

Change the import on line 13:

```ts
import { E2EEManager } from './manager';
```

Actually that file imports from its own module. The real site is `frontend/src/lib/e2ee/connection.ts`. Open that file and find line 189-190:

```ts
    const manager = E2EEManager.getInstance();
    const publicKey = manager.getContentPublicKey(this.options!.machineId);
```

Replace with:

```ts
    const publicKey = getContentPublicKey(this.options!.machineId);
```

And update the import at the top (line 13) — remove the `E2EEManager` import and add:

```ts
import { getContentPublicKey } from './pairing';
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/e2ee/connection.ts
git commit -m "refactor(e2ee): GatewayMachineConnection uses pairing.getContentPublicKey"
```

---

## Phase 6: Delete dead code

### Task 6.1: Delete `GatewayNode` class, remove field from `ConnectionNode`, drop onChange bridge

**Files:**
- Delete: `frontend/src/lib/connections/gatewayNode.ts`
- Modify: `frontend/src/lib/connections/index.ts`
- Modify: `frontend/src/stores/connection-store.ts`

- [ ] **Step 1: Drop `GatewayNode` references from store**

In `frontend/src/stores/connection-store.ts`:

1. Remove `import { GatewayNode } from '@/lib/connections/gatewayNode';`.
2. From `ConnectionNode` interface, remove the `gatewayNode?: GatewayNode;` field.
3. From `ConnectionStoreActions`, remove `getGatewayNode(connectionId: string): GatewayNode | undefined;` and the legacy variants `pairMachineLegacy` / `unpairMachineLegacy`.
4. Inside `create(...)`, remove the `getGatewayNode` implementation and the `pairMachineLegacy` / `unpairMachineLegacy` impls.
5. Inside `init()` entries map, remove everything that creates `new GatewayNode(...)` and the `node.onChange(() => set(...))` bridge. The returned object now looks like:

```ts
       return {
         entry,
         gatewayUrl: entry.url,
         gatewayState: {
           ...EMPTY_GATEWAY_STATE,
           session: persistedSession,
         },
       };
```

  Same change in `addConnection()` and `updateConnectionUrl()` for the gateway branch:

```ts
    const gwState: GatewayState = { ...EMPTY_GATEWAY_STATE };
    node.gatewayUrl = url;
    node.gatewayState = gwState;
    // remove the new GatewayNode(...) and onChange bridge
```

6. Any remaining `node?.gatewayNode?.X` chain — search & replace to selector reads:

Run: `grep -n "gatewayNode" frontend/src/stores/connection-store.ts`

For `getConnection()` (around line 290-295), currently:

```ts
    if (node.gatewayNode && machineId) {
      return node.gatewayNode.getMachineConnection(machineId);
    }
```

Replace with:

```ts
    if (node.gatewayState?.session && node.gatewayUrl && machineId) {
      const machine = node.gatewayState.machines.find(
        (m) => m.machine_id === machineId
      );
      return machineRegistry.getOrCreate(
        connectionId,
        machineId,
        node.gatewayUrl,
        node.gatewayState.session,
        machine?.hostname || machineId.slice(0, 8)
      );
    }
```

Apply the same pattern in every other place that called `.gatewayNode.getMachineConnection(...)`.

For `removeConnection()` (line 205) and `updateConnectionUrl()` (line 227): replace `node.gatewayNode?.destroy()` with `machineRegistry.destroyAllForConnection(node.entry.id)`.

For the two helper getters at the bottom (`getGatewayNode`, plus references to `node?.gatewayNode?.machines` / `.session`): replace with reads from `gatewayState`:

```ts
  getMachines(connectionId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    return node?.gatewayState?.machines ?? [];
  },
  getSession(connectionId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    return node?.gatewayState?.session ?? null;
  },
```

- [ ] **Step 2: Update e2ee consumer if anything else referenced E2EEManager**

Run: `grep -rn 'E2EEManager\|gatewayNode\|GatewayNode' frontend/src/`
Expected: only the test in `frontend/src/lib/e2ee/__tests__/pairing.test.ts` is allowed (the test is fine); anything else needs cleanup.

- [ ] **Step 3: Delete `gatewayNode.ts`**

Run: `git rm frontend/src/lib/connections/gatewayNode.ts`

- [ ] **Step 4: Update `lib/connections/index.ts`**

Remove the line `export { GatewayNode } from './gatewayNode';`.

- [ ] **Step 5: Typecheck + tests**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/connection-store.ts frontend/src/lib/connections/index.ts
git commit -m "refactor(gateway-state): delete GatewayNode class + onChange bridge"
```

---

### Task 6.2: Delete `E2EEManager` class

**Files:**
- Delete: `frontend/src/lib/e2ee/manager.ts`
- Modify: `frontend/src/lib/e2ee/index.ts`

- [ ] **Step 1: Confirm no callers remain**

Run: `grep -rn 'E2EEManager' frontend/src/`
Expected: zero matches.

If anything remains, fix it (likely a missed import in Task 5.2). Don't proceed until clean.

- [ ] **Step 2: Delete `manager.ts`**

Run: `git rm frontend/src/lib/e2ee/manager.ts`

- [ ] **Step 3: Update `lib/e2ee/index.ts`**

In `frontend/src/lib/e2ee/index.ts`, remove the `E2EEManager` re-export. Add `getContentPublicKey` from `./pairing` if any callers import it from `@/lib/e2ee` (check with `grep -rn "from '@/lib/e2ee'" frontend/src/ | grep -v 'e2ee/'`). Usually the caller imports directly from `./pairing`; add if convenient, skip otherwise.

- [ ] **Step 4: Typecheck + tests**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run && ./node_modules/.bin/eslint src --max-warnings 0`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/e2ee/index.ts
git commit -m "refactor(e2ee): delete E2EEManager class (replaced by pairing module)"
```

---

### Task 6.3: Final end-to-end verification

**Files:** none new; verification only.

- [ ] **Step 1: Full frontend check**

Run: `cd frontend && pnpm run check && pnpm run lint`
Expected: all PASS.

- [ ] **Step 2: Full unit test suite**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: all PASS.

- [ ] **Step 3: Production frontend build (gateway mode)**

Run: `cd frontend && VITE_APP_MODE=gateway pnpm run build`
Expected: build succeeds, `frontend/dist/` has updated hash.

- [ ] **Step 4: Gateway binary rebuild**

Run: `cargo build -p e2ee-gateway --release`
Expected: build succeeds.

- [ ] **Step 5: Deploy to the remote gateway (ask user)**

Prompt the user for the deployment procedure (scp binary + restart systemd, or similar).

- [ ] **Step 6: Manual smoke on deployed gateway**

In a fresh browser (clear localStorage, especially `vb_connection_store` and the orphaned `vb_e2ee_machine_secrets` if still present):

1. Visit the gateway URL. Expect login page (or signup if first user).
2. Login. Expect home tab with "No machines online" if no daemon is connected, OR the daemon row immediately.
3. Start a bridge daemon on another host. Expect the row to appear without refresh.
4. Click the row → expand pair form → paste master secret → Pair. Expect "Paired" (green Wifi icon).
5. Click the row again → a projects tab opens and loads projects.
6. Click Sign out. Expect login page.
7. Refresh the browser. Expect login page (session cleared).
8. Login again, go to home. Expect the machine row pre-paired (thanks to persisted `machineSecrets`).

- [ ] **Step 7: Final commit + tag (no code change, just marker)**

Nothing to commit — merge the branch. Or squash-commit all phase commits at PR time per local policy.

---

## Self-review checklist

- [x] Spec sections covered:
  - Store shape → Task 1.1, 1.2, 2.3 (slice setters)
  - `persist` middleware → Task 1.2
  - `gateway-service.ts` → Task 2.3, 2.4, 5.1
  - `machine-registry.ts` → Task 2.2
  - `pairing.ts` → Task 2.1
  - Component rewrites → Task 4.1-4.4
  - `GatewayMachineConnection` swap → Task 5.2
  - Deletions → Task 6.1, 6.2
  - Dual-write phase → Task 3.1
  - Migration strategy phases → Phases 1-6 map to spec Steps 1-6
- [x] No "TODO"/"TBD"/"implement later" in any task body.
- [x] Each code block is complete (not `...`) except where elision is clearly marked ("keep existing JSX unchanged" and similar).
- [x] Method / type names are consistent: `pairMachine(machineId, secret)` (global, 2 args) throughout; `pairMachineLegacy(connectionId, machineId, secret)` for compatibility in Phases 1-5; both exist simultaneously only during the window between Task 1.2 and Task 6.1.
- [x] Commits are frequent (one per task step cluster), each in a compilable state.
- [x] Tests written before implementation per TDD where feasible (Tasks 2.1 through 2.4).
