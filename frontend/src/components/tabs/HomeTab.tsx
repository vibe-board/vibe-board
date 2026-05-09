// frontend/src/components/tabs/HomeTab.tsx
import { useState, useCallback } from 'react';
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
import { MachinePairingForm } from './MachinePairingForm';
import type { MachineStatus } from '@/lib/e2ee';

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
  };
}) {
  const { removeConnection, logoutConnection } = useConnectionStore();
  const [expanded, setExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const gatewayState = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === node.entry.id)?.gatewayState
  );
  if (!gatewayState) return null;
  const isLoggedIn = !!gatewayState.session;

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
              registrationOpen={gatewayState.registrationOpen}
              authError={gatewayState.authError}
              authLoading={gatewayState.authLoading}
            />
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {gatewayState.machines.length === 0 && (
                <p className="text-sm text-foreground/40">No machines online</p>
              )}
              {gatewayState.machines.map((m) => (
                <MachineNodeView
                  key={m.machine_id}
                  machine={m}
                  connectionId={node.entry.id}
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
}: {
  machine: MachineStatus;
  connectionId: string;
}) {
  const { openMachineProjectsTab } = useConnectionStore();
  const [showPairing, setShowPairing] = useState(false);
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );

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
          connectionId={connectionId}
          machineId={machine.machine_id}
          onPaired={() => setShowPairing(false)}
        />
      )}
    </div>
  );
}
