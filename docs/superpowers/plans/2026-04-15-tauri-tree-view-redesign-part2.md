# Tauri Tree View Redesign — Part 2 (Tasks 3–4)

Continues from `2026-04-15-tauri-tree-view-redesign.md`.

---

## Task 3: Simplify HomeTab — remove inline projects, scale up, add scroll

**Files:**
- Modify: `frontend/src/components/tabs/HomeTab.tsx`

- [ ] **Step 1: Rewrite HomeTab.tsx**

Replace the full content of `frontend/src/components/tabs/HomeTab.tsx`:

```typescript
// frontend/src/components/tabs/HomeTab.tsx
import { useState, useCallback, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Server,
  Globe,
  MoreHorizontal,
  LogOut,
  Trash2,
  Wifi,
  WifiOff,
  Monitor,
} from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';
import { AddConnectionForm } from './AddConnectionForm';
import type { GatewayNode } from '@/lib/connections/gatewayNode';
import type { MachineStatus } from '@/lib/e2ee';
import { deriveAuthKeyPair } from '@/lib/e2ee';

export function HomeTab() {
  const nodes = useConnectionStore((s) => s.nodes);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Connections</h2>
        <button
          className="px-3 py-1.5 text-sm border border-border rounded text-foreground/70 hover:text-foreground"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAddForm && (
        <AddConnectionForm onDone={() => setShowAddForm(false)} />
      )}

      {nodes.length === 0 && !showAddForm && (
        <p className="text-sm text-foreground/50 text-center py-8">
          No connections configured. Click &quot;+ Add&quot; to get started.
        </p>
      )}

      <div className="space-y-2">
        {nodes.map((node) =>
          node.entry.type === 'direct' ? (
            <DirectNodeView key={node.entry.id} node={node} />
          ) : (
            <GatewayNodeView key={node.entry.id} node={node} />
          )
        )}
      </div>
    </div>
  );
}

// -- Direct Node --

function DirectNodeView({
  node,
}: {
  node: {
    entry: { id: string; url: string; label?: string };
    directConn?: { status: string; error: string | null };
  };
}) {
  const { removeConnection, openMachineProjectsTab } = useConnectionStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleClick = () => {
    openMachineProjectsTab(
      node.entry.id,
      undefined,
      node.entry.label || node.entry.url
    );
  };

  return (
    <div className="border border-border rounded-md bg-muted/30">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:text-foreground/80"
          onClick={handleClick}
        >
          <Server size={16} className="text-foreground/60 shrink-0" />
          <span className="text-base font-medium truncate">
            {node.entry.label || node.entry.url}
          </span>
        </button>
        <span className="text-sm text-foreground/40 shrink-0">Direct</span>
        <div className="relative shrink-0">
          <button
            className="p-1.5 rounded hover:bg-foreground/10"
            onClick={() => setShowMenu(!showMenu)}
          >
            <MoreHorizontal size={16} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[140px]">
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                onClick={() => {
                  removeConnection(node.entry.id);
                  setShowMenu(false);
                }}
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Gateway Node --

function GatewayNodeView({
  node,
}: {
  node: {
    entry: { id: string; url: string; label?: string };
    gatewayNode?: GatewayNode;
  };
}) {
  const { removeConnection, logoutConnection } = useConnectionStore();
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
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Globe size={16} className="text-foreground/60" />
        <span className="text-base font-medium flex-1 truncate">
          {node.entry.label || node.entry.url}
        </span>
        <span className="text-sm text-foreground/40">E2EE</span>
        <div className="relative">
          <button
            className="p-1.5 rounded hover:bg-foreground/10"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal size={16} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[140px]">
              {isLoggedIn && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-foreground/5"
                  onClick={(e) => {
                    e.stopPropagation();
                    logoutConnection(node.entry.id);
                    setShowMenu(false);
                  }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              )}
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  removeConnection(node.entry.id);
                }}
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pl-10">
          {!isLoggedIn ? (
            <GatewayLoginForm
              connectionId={node.entry.id}
              registrationOpen={gwNode.registrationOpen}
              authError={gwNode.authError}
              authLoading={gwNode.authLoading}
            />
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {gwNode.machines.length === 0 && (
                <p className="text-sm text-foreground/40">No machines online</p>
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

  const handleSubmit = useCallback(async () => {
    if (isSignup) {
      await signupConnection(connectionId, email, password, name || undefined);
    } else {
      await loginConnection(connectionId, email, password);
    }
  }, [
    isSignup,
    signupConnection,
    loginConnection,
    connectionId,
    email,
    password,
    name,
  ]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground/50">Not logged in</p>
      {isSignup && (
        <input
          className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
      />
      {authError && <p className="text-sm text-destructive">{authError}</p>}
      <div className="flex gap-2 items-center">
        <button
          className="px-3 py-1.5 text-sm bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={authLoading || !email || !password}
        >
          {authLoading ? '...' : isSignup ? 'Sign up' : 'Log in'}
        </button>
        {registrationOpen && (
          <button
            className="text-sm text-foreground/50 hover:text-foreground underline"
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
// Simplified: clicking a paired machine opens MachineProjectsTab.
// Unpaired machines still expand pairing UI inline.

function MachineNodeView({
  machine,
  connectionId,
  gatewayNode,
}: {
  machine: MachineStatus;
  connectionId: string;
  gatewayNode: GatewayNode;
}) {
  const { openMachineProjectsTab, pairMachine, unpairMachine } =
    useConnectionStore();
  const [showPairing, setShowPairing] = useState(false);
  const [pairSecret, setPairSecret] = useState('');
  const [pairError, setPairError] = useState('');
  const [pairLoading, setPairLoading] = useState(false);
  const isPaired = gatewayNode.isMachinePaired(machine.machine_id);

  const machineLabel =
    machine.hostname || machine.machine_id.slice(0, 8);

  const handleClick = () => {
    if (isPaired) {
      openMachineProjectsTab(connectionId, machine.machine_id, machineLabel);
    } else {
      setShowPairing(!showPairing);
    }
  };

  const handlePair = async () => {
    const secret = pairSecret.trim();
    if (!secret) return;
    setPairLoading(true);
    setPairError('');
    try {
      const secretBytes = Uint8Array.from(atob(secret), (c) =>
        c.charCodeAt(0)
      );
      const authKp = await deriveAuthKeyPair(secretBytes);
      const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

      const session = gatewayNode.session;
      if (!session) throw new Error('Not logged in');
      const regResp = await fetch(
        `${gatewayNode.gatewayUrl}/api/auth/device/register`,
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

      const credResp = await fetch('/api/e2ee/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_secret: secret,
          gateway_url: gatewayNode.gatewayUrl,
          session_token: session.sessionToken,
          user_id: session.userId,
        }),
      });
      if (!credResp.ok) {
        const text = await credResp.text();
        throw new Error(
          `Backend credentials failed (${credResp.status}): ${text}`
        );
      }

      pairMachine(connectionId, machine.machine_id, secret);
      setPairSecret('');
      setShowPairing(false);
    } catch (e) {
      setPairError(e instanceof Error ? e.message : 'Pairing failed');
    } finally {
      setPairLoading(false);
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
        <div className="px-3 pb-3 pl-9 space-y-2">
          <input
            className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded"
            placeholder="Paste master secret from bridge terminal (base64)"
            value={pairSecret}
            onChange={(e) => setPairSecret(e.target.value)}
            disabled={pairLoading}
          />
          <p className="text-xs text-foreground/40">
            Copy the master secret from the bridge terminal output.
          </p>
          {pairError && (
            <p className="text-sm text-destructive">{pairError}</p>
          )}
          <button
            className="px-3 py-1 text-sm bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
            onClick={handlePair}
            disabled={!pairSecret.trim() || pairLoading}
          >
            {pairLoading ? 'Registering...' : 'Pair'}
          </button>
        </div>
      )}
    </div>
  );
}
```

Key changes from original:
- **DirectNodeView**: No longer expands/loads projects. Click opens `openMachineProjectsTab`.
- **GatewayNodeView**: Machine list gets `max-h-[400px] overflow-y-auto`.
- **MachineNodeView**: Click on paired machine opens `openMachineProjectsTab`. Click on unpaired toggles pairing UI. No more inline project list.
- **All sizes scaled up**: `text-xs` → `text-sm`, `text-sm` → `text-base`, icons `12-14px` → `16px`, padding `px-2/px-3 py-1/py-2` → `px-3/px-4 py-2/py-2.5`.

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/HomeTab.tsx
git commit -m "feat(tabs): simplify HomeTab, scale up UI, add scroll"
```

---

## Task 4: Scale up AddConnectionForm

**Files:**
- Modify: `frontend/src/components/tabs/AddConnectionForm.tsx`

- [ ] **Step 1: Update AddConnectionForm sizes**

Replace the full content of `frontend/src/components/tabs/AddConnectionForm.tsx`:

```typescript
// frontend/src/components/tabs/AddConnectionForm.tsx
import { useState, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection-store';

type ConnectionMode = 'direct' | 'gateway';

export function AddConnectionForm({ onDone }: { onDone?: () => void }) {
  const addConnection = useConnectionStore((s) => s.addConnection);
  const [mode, setMode] = useState<ConnectionMode>('direct');
  const [url, setUrl] = useState('');
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
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
    <div className="border border-border rounded-md p-4 bg-background space-y-3">
      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 text-sm rounded border ${
            mode === 'direct'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-foreground/70 hover:text-foreground'
          }`}
          onClick={() => setMode('direct')}
        >
          Direct (Local)
        </button>
        <button
          className={`px-3 py-1.5 text-sm rounded border ${
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
        <label className="text-sm text-foreground/60 block mb-1">
          {mode === 'direct' ? 'Backend URL' : 'Gateway URL'}
        </label>
        <input
          className="w-full px-3 py-2 text-sm bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTestStatus('idle');
          }}
          placeholder={
            mode === 'direct'
              ? 'http://localhost:3001'
              : 'https://gateway.example.com'
          }
        />
      </div>

      {mode === 'direct' && (
        <div className="flex gap-2 items-center">
          <button
            className="px-3 py-1.5 text-sm border border-border rounded text-foreground/70 hover:text-foreground"
            onClick={testConnection}
            disabled={testStatus === 'testing' || !url}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {testStatus === 'success' && (
            <span className="text-sm text-green-500">Connected</span>
          )}
          {testStatus === 'error' && (
            <span className="text-sm text-destructive">{testError}</span>
          )}
        </div>
      )}

      <button
        className="w-full px-4 py-2 text-sm font-medium bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
        onClick={handleAdd}
        disabled={!url.trim()}
      >
        Add Connection
      </button>
    </div>
  );
}
```

Key changes: `text-xs` → `text-sm`, `px-2 py-1` → `px-3 py-1.5`, `p-3` → `p-4`, input `py-1.5` → `py-2`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/tabs/AddConnectionForm.tsx
git commit -m "feat(tabs): scale up AddConnectionForm for desktop"
```

---

Continued in `2026-04-15-tauri-tree-view-redesign-part3.md`.
