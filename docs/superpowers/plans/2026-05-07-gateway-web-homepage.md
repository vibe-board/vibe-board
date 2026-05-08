# Gateway Web Homepage + Pairing Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a gateway-web-specific shell (full-screen login → tab bar + machine list) when `VITE_APP_MODE=gateway`, and remove the redundant `/api/e2ee/credentials` HTTP endpoint together with its frontend caller.

**Architecture:** Three-way mode dispatch in `TabShell` (`local-direct` / `gateway` / `tauri`). A new `GatewayShell` owns the gateway-only auto-bootstrap: connection-store `init()` seeds a fixed `gateway-self` connection pinned to `window.location.origin`; the shell swaps between `GatewayLoginScreen` and `TabBar + GatewayHomeTab + machine tabs` based on `gwNode.session`. Pairing collapses to browser-side: device-register on the gateway + localStorage write. The local backend HTTP route is deleted.

**Tech Stack:** TypeScript, React 18, Zustand, react-router, Vitest, Vite. Rust backend (Axum).

**Spec:** `docs/superpowers/specs/2026-05-07-gateway-web-homepage-design.md`

---

## File Structure

**New (frontend):**
- `frontend/src/lib/appMode.ts` — central mode detection
- `frontend/src/components/tabs/MachinePairingForm.tsx` — extracted pairing UI shared by tauri `HomeTab` and `GatewayHomeTab`
- `frontend/src/components/tabs/GatewayLoginScreen.tsx` — full-screen login card
- `frontend/src/components/tabs/GatewayHomeTab.tsx` — machine list in gateway home
- `frontend/src/components/tabs/GatewayShell.tsx` — gateway mode shell entry
- `frontend/src/stores/__tests__/connection-store-gateway.test.ts` — unit tests for gateway seeding

**Modified (frontend):**
- `frontend/src/lib/isLocalDirect.ts` — re-export from `appMode.ts`
- `frontend/src/components/tabs/TabShell.tsx` — three-way dispatch
- `frontend/src/stores/connection-store.ts` — `GATEWAY_SELF_ID` constant, gateway-mode seeding in `init()`, `removeConnection()` guard, `logoutConnection()` tab cleanup
- `frontend/src/components/tabs/HomeTab.tsx` — replace lines 315-447 inline pairing with `<MachinePairingForm>`; remove `/api/e2ee/credentials` fetch

**Deleted (backend):**
- `crates/server/src/routes/e2ee.rs`

**Modified (backend):**
- `crates/server/src/routes/mod.rs` — remove `pub mod e2ee;` (line 15) + `.merge(e2ee::router())` (line 60)
- `crates/server/src/e2ee_manager.rs` — remove dead `is_gateway_running` method (lines 99-104)

---

## Task 1: Add `appMode` mode detection layer

**Files:**
- Create: `frontend/src/lib/appMode.ts`
- Modify: `frontend/src/lib/isLocalDirect.ts`

- [ ] **Step 1: Create `appMode.ts`**

```ts
// frontend/src/lib/appMode.ts
type AppMode = 'local-direct' | 'gateway' | 'tauri';

export const appMode: AppMode = (() => {
  const m = import.meta.env.VITE_APP_MODE;
  if (m === 'local-direct') return 'local-direct';
  if (m === 'gateway') return 'gateway';
  return 'tauri';
})();

export const isLocalDirect = appMode === 'local-direct';
export const isGateway = appMode === 'gateway';
export const isTauri = appMode === 'tauri';
```

- [ ] **Step 2: Replace `isLocalDirect.ts` with re-export**

```ts
// frontend/src/lib/isLocalDirect.ts
export { isLocalDirect } from './appMode';
```

- [ ] **Step 3: Verify TypeScript still passes**

Run: `pnpm run frontend:check`
Expected: clean exit (no errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/appMode.ts frontend/src/lib/isLocalDirect.ts
git commit -m "feat(frontend): add appMode flag with isGateway/isTauri detection"
```

---

## Task 2: Connection-store gateway seeding (with tests)

**Files:**
- Modify: `frontend/src/stores/connection-store.ts`
- Create: `frontend/src/stores/__tests__/connection-store-gateway.test.ts`

- [ ] **Step 1: Write failing test for gateway seeding**

Create `frontend/src/stores/__tests__/connection-store-gateway.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Important: mock appMode BEFORE importing connection-store
vi.mock('@/lib/appMode', () => ({
  isLocalDirect: false,
  isGateway: true,
  isTauri: false,
  appMode: 'gateway',
}));

// Avoid loading the real e2ee crypto / migration in tests
vi.mock('@/stores/migration', () => ({ runMigrationIfNeeded: vi.fn() }));

describe('connection-store gateway-self seeding', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
  });

  it('seeds a single gateway-self connection on init when localStorage is empty', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '../connection-store'
    );
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gateway.example.com' },
      writable: true,
      configurable: true,
    });

    useConnectionStore.getState().init();

    const nodes = useConnectionStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].entry.id).toBe(GATEWAY_SELF_ID);
    expect(nodes[0].entry.type).toBe('gateway');
    expect(nodes[0].entry.url).toBe('https://gateway.example.com');
  });

  it('does NOT persist gateway-mode entries to localStorage (preserves tauri data)', async () => {
    const { useConnectionStore } = await import('../connection-store');

    // Seed previous tauri connections in localStorage
    localStorage.setItem(
      'vb_connections',
      JSON.stringify([
        { id: 'tauri-1', type: 'gateway', url: 'https://other.example.com' },
        { id: 'tauri-2', type: 'direct', url: 'http://laptop.local:3001' },
      ])
    );
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gateway.example.com' },
      writable: true,
      configurable: true,
    });

    useConnectionStore.getState().init();

    // localStorage should still hold the original tauri entries (untouched)
    const persisted = JSON.parse(localStorage.getItem('vb_connections')!);
    expect(persisted.map((e: { id: string }) => e.id)).toEqual([
      'tauri-1',
      'tauri-2',
    ]);

    // But in-memory nodes should ONLY include gateway-self
    const nodes = useConnectionStore.getState().nodes;
    expect(nodes.map((n) => n.entry.id)).toEqual(['gateway-self']);
  });

  it('removeConnection refuses to remove gateway-self', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '../connection-store'
    );
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gateway.example.com' },
      writable: true,
      configurable: true,
    });

    useConnectionStore.getState().init();
    const before = useConnectionStore.getState().nodes.length;

    useConnectionStore.getState().removeConnection(GATEWAY_SELF_ID);

    expect(useConnectionStore.getState().nodes).toHaveLength(before);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter ./frontend exec vitest run src/stores/__tests__/connection-store-gateway.test.ts`

Expected: FAIL — `GATEWAY_SELF_ID` not exported, gateway seeding not implemented.

- [ ] **Step 3: Implement seeding in `connection-store.ts`**

Add at the top, near other imports:

```ts
import { isGateway } from '@/lib/appMode';

export const GATEWAY_SELF_ID = 'gateway-self';
```

Replace the body of `init()` (current `frontend/src/stores/connection-store.ts:120-145`) with:

```ts
init() {
  if (get().initialized) return;
  runMigrationIfNeeded();

  let entries = loadConnections();

  if (isGateway) {
    const sameOrigin = window.location.origin;
    const existing = entries.find((e) => e.id === GATEWAY_SELF_ID);
    if (existing) {
      entries = entries
        .filter((e) => e.id === GATEWAY_SELF_ID)
        .map((e) => ({ ...e, url: sameOrigin }));
    } else {
      entries = [
        {
          id: GATEWAY_SELF_ID,
          type: 'gateway',
          url: sameOrigin,
          label: 'Gateway',
        },
      ];
    }
    // Deliberately DO NOT call saveConnections — leave localStorage alone so
    // switching back to tauri preserves the user's other connections.
  }

  const nodes: ConnectionNode[] = entries.map((entry) => {
    if (entry.type === 'direct') {
      const conn = new DirectConnection(
        entry.id,
        entry.url,
        entry.label || entry.url
      );
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
```

Add a guard at the top of `removeConnection()` (current `frontend/src/stores/connection-store.ts:171-191`):

```ts
removeConnection(id) {
  if (isGateway && id === GATEWAY_SELF_ID) return;
  set((s) => {
    // ...existing body unchanged
  });
},
```

**Note**: `logoutConnection()` (`frontend/src/stores/connection-store.ts:230-244`) already filters tabs by `connectionId` and resets `activeTabId` to `'home'` when the active tab disappears. This satisfies the spec's "Sign out tab cleanup" requirement for gateway mode without any code change. **Do not modify `logoutConnection`.**

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter ./frontend exec vitest run src/stores/__tests__/connection-store-gateway.test.ts`
Expected: PASS for all three tests.

- [ ] **Step 5: Run full type check + lint**

Run: `pnpm run frontend:check && pnpm run frontend:lint`
Expected: clean exits.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/connection-store.ts frontend/src/stores/__tests__/connection-store-gateway.test.ts
git commit -m "feat(frontend): seed gateway-self connection in gateway mode"
```

---

## Task 3: Extract `MachinePairingForm`; remove `/api/e2ee/credentials` fetch

**Files:**
- Create: `frontend/src/components/tabs/MachinePairingForm.tsx`
- Modify: `frontend/src/components/tabs/HomeTab.tsx`

- [ ] **Step 1: Create `MachinePairingForm.tsx`**

```tsx
// frontend/src/components/tabs/MachinePairingForm.tsx
import { useState } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { deriveAuthKeyPair } from '@/lib/e2ee';
import type { GatewayNode } from '@/lib/connections/gatewayNode';

interface MachinePairingFormProps {
  gwNode: GatewayNode;
  machineId: string;
  onPaired?: () => void;
}

export function MachinePairingForm({
  gwNode,
  machineId,
  onPaired,
}: MachinePairingFormProps) {
  const { pairMachine } = useConnectionStore();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    const trimmed = secret.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const session = gwNode.session;
      if (!session) throw new Error('Not logged in');

      const secretBytes = Uint8Array.from(atob(trimmed), (c) =>
        c.charCodeAt(0)
      );
      const authKp = await deriveAuthKeyPair(secretBytes);
      const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

      const regResp = await fetch(
        `${gwNode.gatewayUrl}/api/auth/device/register`,
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

      pairMachine(gwNode.connectionId, machineId, trimmed);
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

- [ ] **Step 2: Update `HomeTab.tsx` to use `MachinePairingForm`**

In `frontend/src/components/tabs/HomeTab.tsx`:

1. Add the import near the top: `import { MachinePairingForm } from './MachinePairingForm';`
2. Remove the unused imports that were only needed by the inline pair flow if any (check `deriveAuthKeyPair` — likely now unused in `HomeTab.tsx`).
3. Replace the entire body of `MachineNodeView` (lines ~315-447) — keep the row UI but replace the inline pair fields/state/`handlePair` with the new component.

Replace `MachineNodeView` with:

```tsx
function MachineNodeView({
  machine,
  connectionId,
  gatewayNode,
}: {
  machine: MachineStatus;
  connectionId: string;
  gatewayNode: GatewayNode;
}) {
  const { openMachineProjectsTab } = useConnectionStore();
  const [showPairing, setShowPairing] = useState(false);
  const isPaired = gatewayNode.isMachinePaired(machine.machine_id);

  const machineLabel = machine.hostname || machine.machine_id.slice(0, 8);

  const handleClick = () => {
    if (isPaired) {
      openMachineProjectsTab(connectionId, machine.machine_id, machineLabel);
    } else {
      setShowPairing(!showPairing);
    }
  };

  return (
    <div className="border border-border/50 rounded bg-background/50">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={handleClick}
      >
        {isPaired ? (
          <Wifi size={16} className="text-green-500 shrink-0" />
        ) : showPairing ? (
          <ChevronDown size={16} className="shrink-0" />
        ) : (
          <WifiOff size={16} className="text-foreground/30 shrink-0" />
        )}
        <Monitor size={16} className="text-foreground/50 shrink-0" />
        <span className="text-sm flex-1 truncate">
          {machineLabel}
          {machine.port ? `:${machine.port}` : ''}
        </span>
        {!isPaired && (
          <span className="text-sm text-foreground/40">Not paired</span>
        )}
      </div>

      {showPairing && !isPaired && (
        <MachinePairingForm
          gwNode={gatewayNode}
          machineId={machine.machine_id}
          onPaired={() => setShowPairing(false)}
        />
      )}
    </div>
  );
}
```

Also remove the now-unused imports `deriveAuthKeyPair` from `@/lib/e2ee` if `HomeTab.tsx` no longer references it elsewhere. Run `pnpm run frontend:lint` to surface unused imports.

- [ ] **Step 3: Type check + lint**

Run: `pnpm run frontend:check && pnpm run frontend:lint`
Expected: clean exits. Fix any unused-import warnings by deleting them.

- [ ] **Step 4: Run all frontend tests (no regressions)**

Run: `pnpm --filter ./frontend exec vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tabs/MachinePairingForm.tsx frontend/src/components/tabs/HomeTab.tsx
git commit -m "refactor(frontend): extract MachinePairingForm; drop /api/e2ee/credentials caller"
```

---

## Task 4: Add `GatewayLoginScreen`

**Files:**
- Create: `frontend/src/components/tabs/GatewayLoginScreen.tsx`

- [ ] **Step 1: Create `GatewayLoginScreen.tsx`**

```tsx
// frontend/src/components/tabs/GatewayLoginScreen.tsx
import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';
import type { GatewayNode } from '@/lib/connections/gatewayNode';

export function GatewayLoginScreen({ gwNode }: { gwNode: GatewayNode }) {
  const { loginConnection, signupConnection } = useConnectionStore();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Force re-render when gwNode internal state changes
  const [, force] = useState(0);
  useEffect(() => gwNode.onChange(() => force((t) => t + 1)), [gwNode]);

  // Refresh registration-status on mount
  useEffect(() => {
    gwNode.fetchRegistrationStatus();
  }, [gwNode]);

  const { registrationOpen, authError, authLoading } = gwNode;

  const handleSubmit = useCallback(async () => {
    if (isSignup) {
      await signupConnection(
        gwNode.connectionId,
        email,
        password,
        name || undefined
      );
    } else {
      await loginConnection(gwNode.connectionId, email, password);
    }
  }, [
    isSignup,
    signupConnection,
    loginConnection,
    gwNode.connectionId,
    email,
    password,
    name,
  ]);

  return (
    <div className="flex items-center justify-center h-screen bg-background px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Vibe Board</h1>
          <p className="text-sm text-foreground/50">
            {isSignup ? 'Create an account' : 'Sign in to continue'}
          </p>
        </div>

        <div className="space-y-2">
          {isSignup && (
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
        </div>

        {authError && <p className="text-sm text-destructive">{authError}</p>}

        <button
          className="w-full px-3 py-2 text-sm bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50 flex items-center justify-center gap-2"
          onClick={handleSubmit}
          disabled={authLoading || !email || !password}
        >
          {authLoading && <Loader2 size={14} className="animate-spin" />}
          {isSignup ? 'Sign up' : 'Log in'}
        </button>

        {registrationOpen && (
          <p className="text-center text-sm text-foreground/50">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              className="text-foreground underline hover:opacity-80"
              onClick={() => setIsSignup(!isSignup)}
            >
              {isSignup ? 'Log in' : 'Sign up'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `pnpm run frontend:check && pnpm run frontend:lint`
Expected: clean exits.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/GatewayLoginScreen.tsx
git commit -m "feat(frontend): add GatewayLoginScreen for gateway-web mode"
```

---

## Task 5: Add `GatewayHomeTab`

**Files:**
- Create: `frontend/src/components/tabs/GatewayHomeTab.tsx`

- [ ] **Step 1: Create `GatewayHomeTab.tsx`**

```tsx
// frontend/src/components/tabs/GatewayHomeTab.tsx
import { useEffect, useState } from 'react';
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
import type { GatewayNode } from '@/lib/connections/gatewayNode';
import type { MachineStatus } from '@/lib/e2ee';

export function GatewayHomeTab({ gwNode }: { gwNode: GatewayNode }) {
  const { logoutConnection } = useConnectionStore();
  const [, force] = useState(0);
  useEffect(() => gwNode.onChange(() => force((t) => t + 1)), [gwNode]);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Machines</h2>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded text-foreground/70 hover:text-foreground"
          onClick={() => logoutConnection(gwNode.connectionId)}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {gwNode.machines.length === 0 ? (
        <EmptyMachinesPlaceholder />
      ) : (
        <div className="space-y-2">
          {gwNode.machines.map((m) => (
            <MachineRow key={m.machine_id} machine={m} gwNode={gwNode} />
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
  machine,
  gwNode,
}: {
  machine: MachineStatus;
  gwNode: GatewayNode;
}) {
  const { openMachineProjectsTab } = useConnectionStore();
  const isPaired = gwNode.isMachinePaired(machine.machine_id);
  const [showPair, setShowPair] = useState(false);
  const label = machine.hostname || machine.machine_id.slice(0, 8);

  const handleClick = () => {
    if (isPaired) {
      openMachineProjectsTab(gwNode.connectionId, machine.machine_id, label);
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
          gwNode={gwNode}
          machineId={machine.machine_id}
          onPaired={() => setShowPair(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `pnpm run frontend:check && pnpm run frontend:lint`
Expected: clean exits.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/GatewayHomeTab.tsx
git commit -m "feat(frontend): add GatewayHomeTab with sign-out and pairing"
```

---

## Task 6: Add `GatewayShell`

**Files:**
- Create: `frontend/src/components/tabs/GatewayShell.tsx`

- [ ] **Step 1: Create `GatewayShell.tsx`**

```tsx
// frontend/src/components/tabs/GatewayShell.tsx
import { useEffect, useState } from 'react';
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

  // Same Ctrl+1..9 / Ctrl+W shortcuts as MultiConnectionShell.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx === 0) {
          setActiveTab('home');
        } else {
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

  const gwNode = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)?.gatewayNode
  );

  // Force re-render when gwNode session/state changes.
  const [, force] = useState(0);
  useEffect(() => {
    if (!gwNode) return;
    return gwNode.onChange(() => force((t) => t + 1));
  }, [gwNode]);

  if (!initialized || !gwNode) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!gwNode.session) {
    return <GatewayLoginScreen gwNode={gwNode} />;
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
          <GatewayHomeTab gwNode={gwNode} />
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

- [ ] **Step 2: Type check + lint**

Run: `pnpm run frontend:check && pnpm run frontend:lint`
Expected: clean exits.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/GatewayShell.tsx
git commit -m "feat(frontend): add GatewayShell with login/home tab routing"
```

---

## Task 7: Wire `TabShell` three-way dispatch

**Files:**
- Modify: `frontend/src/components/tabs/TabShell.tsx`

- [ ] **Step 1: Replace `TabShell.tsx` body**

```tsx
// frontend/src/components/tabs/TabShell.tsx
import { isLocalDirect, isGateway } from '@/lib/appMode';
import { LocalDirectShell } from './LocalDirectShell';
import { GatewayShell } from './GatewayShell';
import { MultiConnectionShell } from './MultiConnectionShell';

export function TabShell() {
  if (isLocalDirect) return <LocalDirectShell />;
  if (isGateway) return <GatewayShell />;
  return <MultiConnectionShell />;
}
```

- [ ] **Step 2: Type check + lint**

Run: `pnpm run frontend:check && pnpm run frontend:lint`
Expected: clean exits.

- [ ] **Step 3: Build the gateway frontend bundle**

Run: `cd frontend && VITE_APP_MODE=gateway pnpm run build && cd ..`
Expected: build success, `frontend/dist/` populated.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tabs/TabShell.tsx
git commit -m "feat(frontend): three-way TabShell dispatch (local-direct/gateway/tauri)"
```

---

## Task 8: Delete backend `e2ee` route + dead `is_gateway_running`

**Files:**
- Delete: `crates/server/src/routes/e2ee.rs`
- Modify: `crates/server/src/routes/mod.rs`
- Modify: `crates/server/src/e2ee_manager.rs`

- [ ] **Step 1: Delete `crates/server/src/routes/e2ee.rs`**

Run:
```bash
git rm crates/server/src/routes/e2ee.rs
```

- [ ] **Step 2: Remove route registration from `routes/mod.rs`**

In `crates/server/src/routes/mod.rs`:

- Remove line 15: `pub mod e2ee;`
- Remove line 60: `.merge(e2ee::router())`

Use `Edit` tool to apply these two deletions individually so the diff is clean.

- [ ] **Step 3: Remove dead `is_gateway_running` from `e2ee_manager.rs`**

In `crates/server/src/e2ee_manager.rs:99-104`, delete the `pub async fn is_gateway_running(...) -> bool { ... }` method body (the only caller was the just-deleted `get_status` route).

- [ ] **Step 4: Verify backend compiles + lints**

Run:
```bash
cargo check --workspace
cargo clippy --workspace --all-targets --features qa-mode -- -D warnings
```

Expected: both pass. If clippy flags additional unused symbols (e.g., helpers that were only used by `is_gateway_running`), delete them too.

- [ ] **Step 5: Run full Rust test suite**

Run: `cargo test --workspace`
Expected: all tests pass (the removed file's `#[cfg(test)]` block, if any, is also gone, which is fine).

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/routes/mod.rs crates/server/src/e2ee_manager.rs
git commit -m "feat(server): remove redundant /api/e2ee/credentials route (CLI is canonical)"
```

---

## Task 9: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Build the gateway binary with the new frontend bundle**

```bash
pnpm run gateway:build
```

Expected: `target/release/e2ee-gateway` produced; build succeeds.

- [ ] **Step 2: Run the gateway**

```bash
RUST_LOG=info ./target/release/e2ee-gateway
```

Expected: `Gateway listening on …` log line.

- [ ] **Step 3: Open the gateway in a browser**

Visit the URL printed by the gateway (e.g. `http://127.0.0.1:9090`).

Expected: a centered login card with "Vibe Board" heading, Email/Password fields, no tab bar, no `+ Add` button anywhere.

- [ ] **Step 4: Sign up / log in (depending on `registrationOpen`)**

Either log in with existing credentials or sign up. After success:

Expected: tab bar appears with a single `Home` tab; main area shows "Machines" header and "No machines online" empty state (if no CLIs are paired) or a list of machine rows.

- [ ] **Step 5: On a separate machine (or skip if not available), run `vibe-board login --gateway <URL>`**

If you have access to a second machine or VM:

```bash
vibe-board login --gateway <URL>
# follow prompts; copy the master secret it prints
vibe-board                              # start crates/server with BridgeManager
```

Expected: the gateway-web Machines list refreshes (websocket-driven) and shows that machine row, marked `Not paired` from the browser's POV.

If you do **not** have a second machine: skip steps 5–6. Note the limitation in the PR description (UI verified but multi-machine pairing not exercised).

- [ ] **Step 6: Pair the machine from the gateway-web UI**

Click the machine row → expand the inline pair form → paste the same base64 master secret → click `Pair`.

Expected: the row turns green (`Wifi` icon), can be opened to show projects. No `Backend credentials failed (404)` error.

- [ ] **Step 7: Sign out**

Click `Sign out` in the top right.

Expected: returns to the full-screen login card; previously open machine tabs are closed.

- [ ] **Step 8: Verify tauri build still works**

```bash
pnpm run tauri:dev
```

Expected: tauri shell still shows the multi-connection home with `+ Add` button intact; no regression.

- [ ] **Step 9: Verify local-direct dev still works**

```bash
pnpm run dev
```

Expected: same-origin auto-connect, app loads to projects view.

- [ ] **Step 10: Final commit (if any verification fixes were needed)**

If the manual verification surfaced issues, commit the fixes here. Otherwise skip.

---

## Verification summary

Before opening a PR, confirm:

- `pnpm run frontend:check && pnpm run frontend:lint` — clean
- `pnpm --filter ./frontend exec vitest run` — all green
- `cargo check --workspace` — clean
- `cargo clippy --workspace --all-targets --features qa-mode -- -D warnings` — clean
- `cargo test --workspace` — all green
- Gateway-web manual flow (Task 9 steps 3–7) — verified
- Tauri (Task 9 step 8) — no regression
- Local-direct (Task 9 step 9) — no regression
