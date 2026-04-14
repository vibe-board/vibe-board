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
  ExternalLink,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';
import { AddConnectionForm } from './AddConnectionForm';
import type { GatewayNode } from '@/lib/connections/gatewayNode';
import type { MachineStatus } from '@/lib/e2ee';
import { deriveAuthKeyPair } from '@/lib/e2ee';
import type { ConnectionProject } from '@/lib/connections/types';

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
  const { removeConnection, openProjectTab } = useConnectionStore();
  const [expanded, setExpanded] = useState(true);
  const [projects, setProjects] = useState<ConnectionProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const conn = useConnectionStore((s) => s.getConnection(node.entry.id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || !conn) return;
    setLoading(true);
    setError(null);
    conn
      .listProjects()
      .then(setProjects)
      .catch((e: unknown) => {
        setProjects([]);
        setError(e instanceof Error ? e.message : 'Failed to load projects');
      })
      .finally(() => setLoading(false));
  }, [expanded, conn]);

  return (
    <div className="border border-border rounded-md bg-muted/30">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Server size={14} className="text-foreground/60" />
        <span className="text-sm font-medium flex-1 truncate">
          {node.entry.label || node.entry.url}
        </span>
        <span className="text-xs text-foreground/40">Direct</span>
        <div className="relative">
          <button
            className="p-1 rounded hover:bg-foreground/10"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal size={14} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[120px]">
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  removeConnection(node.entry.id);
                }}
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pl-8 space-y-1">
          {loading && (
            <p className="text-xs text-foreground/40">Loading projects...</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="flex-1 truncate">{p.name}</span>
              <button
                className="text-xs text-foreground/50 hover:text-foreground flex items-center gap-1"
                onClick={() =>
                  openProjectTab(node.entry.id, undefined, p.id, p.name)
                }
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
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Globe size={14} className="text-foreground/60" />
        <span className="text-sm font-medium flex-1 truncate">
          {node.entry.label || node.entry.url}
        </span>
        <span className="text-xs text-foreground/40">E2EE</span>
        <div className="relative">
          <button
            className="p-1 rounded hover:bg-foreground/10"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal size={14} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[120px]">
              {isLoggedIn && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-foreground/5"
                  onClick={(e) => {
                    e.stopPropagation();
                    logoutConnection(node.entry.id);
                    setShowMenu(false);
                  }}
                >
                  <LogOut size={12} /> Sign out
                </button>
              )}
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  removeConnection(node.entry.id);
                }}
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
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
  const { openProjectTab, pairMachine, unpairMachine } = useConnectionStore();
  const [expanded, setExpanded] = useState(false);
  const [projects, setProjects] = useState<ConnectionProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pairSecret, setPairSecret] = useState('');
  const [pairError, setPairError] = useState('');
  const [pairLoading, setPairLoading] = useState(false);
  const isPaired = gatewayNode.isMachinePaired(machine.machine_id);

  useEffect(() => {
    if (!expanded || !isPaired) return;
    setLoading(true);
    setLoadError(null);

    const conn = gatewayNode.getMachineConnection(machine.machine_id);
    if (!conn) {
      setLoading(false);
      setLoadError('Could not create machine connection');
      return;
    }

    conn.addRef();
    conn
      .connect()
      .then(() => {
        console.log('[MachineNodeView] Connected, loading projects...');
        return conn.listProjects();
      })
      .then((p) => {
        console.log('[MachineNodeView] Projects loaded:', p.length);
        setProjects(p);
      })
      .catch((e: unknown) => {
        console.error('[MachineNodeView] Error:', e);
        setProjects([]);
        setLoadError(
          e instanceof Error ? e.message : 'Failed to load projects'
        );
      })
      .finally(() => {
        setLoading(false);
        conn.removeRef();
      });
  }, [expanded, isPaired, machine.machine_id, gatewayNode]);

  const handlePair = async () => {
    const secret = pairSecret.trim();
    if (!secret) return;
    setPairLoading(true);
    setPairError('');
    try {
      // Step 1: Derive auth keypair from secret
      const secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
      const authKp = await deriveAuthKeyPair(secretBytes);
      const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

      // Step 2: Register device with gateway
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
      if (!regResp.ok) {
        const text = await regResp.text();
        throw new Error(
          `Device registration failed (${regResp.status}): ${text}`
        );
      }

      // Step 3: Notify local backend of credentials
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
        throw new Error(`Backend credentials failed (${credResp.status}): ${text}`);
      }

      // Step 4: Local pair (localStorage)
      pairMachine(connectionId, machine.machine_id, secret);
      setPairSecret('');
    } catch (e) {
      setPairError(e instanceof Error ? e.message : 'Pairing failed');
    } finally {
      setPairLoading(false);
    }
  };

  const handleUnpair = () => {
    unpairMachine(connectionId, machine.machine_id);
    setLoadError(null);
    setProjects([]);
  };

  return (
    <div className="border border-border/50 rounded bg-background/50">
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isPaired ? (
          <Wifi size={12} className="text-green-500" />
        ) : (
          <WifiOff size={12} className="text-foreground/30" />
        )}
        <span className="text-xs flex-1 truncate">
          {machine.hostname || machine.machine_id.slice(0, 8)}
          {machine.port ? `:${machine.port}` : ''}
        </span>
        {!isPaired && (
          <span className="text-[10px] text-foreground/40">Not paired</span>
        )}
      </div>

      {expanded && (
        <div className="px-2 pb-2 pl-7 space-y-1">
          {!isPaired ? (
            <div className="space-y-1">
              <input
                className="w-full px-2 py-1 text-xs bg-muted border border-border rounded"
                placeholder="Paste master secret from bridge terminal (base64)"
                value={pairSecret}
                onChange={(e) => setPairSecret(e.target.value)}
                disabled={pairLoading}
              />
              <p className="text-[10px] text-foreground/40">
                Copy the master secret from the bridge terminal output.
              </p>
              {pairError && (
                <p className="text-[10px] text-destructive">{pairError}</p>
              )}
              <button
                className="px-2 py-0.5 text-xs bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
                onClick={handlePair}
                disabled={!pairSecret.trim() || pairLoading}
              >
                {pairLoading ? 'Registering...' : 'Pair'}
              </button>
            </div>
          ) : loading ? (
            <p className="text-xs text-foreground/40">Loading projects...</p>
          ) : loadError ? (
            <div className="space-y-1">
              <p className="text-xs text-destructive">{loadError}</p>
              {(loadError.includes('timeout') ||
                loadError.includes('unwrap') ||
                loadError.includes('public key')) && (
                <button
                  className="px-2 py-0.5 text-xs border border-border rounded text-foreground/70 hover:text-foreground"
                  onClick={handleUnpair}
                >
                  Re-pair
                </button>
              )}
            </div>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 py-0.5 text-xs"
              >
                <span className="flex-1 truncate">{p.name}</span>
                <button
                  className="text-foreground/50 hover:text-foreground flex items-center gap-1"
                  onClick={() => {
                    const machineLabel =
                      machine.hostname || machine.machine_id.slice(0, 8);
                    openProjectTab(
                      connectionId,
                      machine.machine_id,
                      p.id,
                      `${p.name} @ ${machineLabel}`
                    );
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
