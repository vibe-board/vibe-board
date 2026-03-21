import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { E2EEServerConfig } from '@/lib/servers/types';
import type { MachineStatus } from '@/lib/e2ee';
import { getServerStore } from '@/lib/servers/serverStore';
import { ArrowLeft, Loader2, Monitor } from 'lucide-react';

interface E2EEServerSetupProps {
  onDone: (config: E2EEServerConfig) => void;
  onBack: () => void;
}

type Step = 'gateway' | 'login' | 'machines';

function normalizeGatewayUrl(raw: string): string {
  let url = raw.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

export function E2EEServerSetup({ onDone, onBack }: E2EEServerSetupProps) {
  const [step, setStep] = useState<Step>('gateway');

  // Gateway step
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [name, setName] = useState('');
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [testError, setTestError] = useState('');

  // Login step
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [sessionToken, setSessionToken] = useState('');

  // Machine step
  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [machineError, setMachineError] = useState('');
  const [machineLoading, setMachineLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const normalizedUrl = gatewayUrl.trim()
    ? normalizeGatewayUrl(gatewayUrl)
    : '';

  // --- Gateway step handlers ---

  const handleTest = async () => {
    setTesting(true);
    setTestError('');
    setTestOk(false);

    try {
      const url = normalizeGatewayUrl(gatewayUrl);
      const resp = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`Gateway returned ${resp.status}`);
      setTestOk(true);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  // --- Login step handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const resp = await fetch(`${normalizedUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Login failed (${resp.status})`);
      }

      const data: { token: string; user_id: string } = await resp.json();
      setSessionToken(data.token);
      setStep('machines');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  // --- Machine step: connect WS to get machine list ---

  useEffect(() => {
    if (step !== 'machines' || !sessionToken || !normalizedUrl) return;

    setMachineLoading(true);
    setMachineError('');
    setMachines([]);

    const wsUrl = normalizedUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');
    const ws = new WebSocket(
      `${wsUrl}/ws/webui?token=${encodeURIComponent(sessionToken)}`
    );
    wsRef.current = ws;

    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        setMachineError('Connection timed out');
        setMachineLoading(false);
        ws.close();
      }
    }, 10000);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'auth_ok') {
          // authenticated, wait for machines list
        } else if (msg.type === 'auth_error') {
          setMachineError('Session expired. Please go back and login again.');
          setMachineLoading(false);
        } else if (msg.type === 'machines') {
          setMachines(msg.machines);
          setMachineLoading(false);
        } else if (msg.type === 'machine_online') {
          setMachines((prev) => {
            if (prev.find((m) => m.machine_id === msg.machine_id)) return prev;
            return [
              ...prev,
              {
                machine_id: msg.machine_id,
                hostname: msg.hostname || '',
                platform: msg.platform || '',
              },
            ];
          });
        } else if (msg.type === 'machine_offline') {
          setMachines((prev) =>
            prev.filter((m) => m.machine_id !== msg.machine_id)
          );
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setMachineError('Failed to connect to gateway');
      setMachineLoading(false);
    };

    ws.onclose = () => {
      clearTimeout(timeout);
    };

    return () => {
      clearTimeout(timeout);
      ws.close();
      wsRef.current = null;
    };
  }, [step, sessionToken, normalizedUrl]);

  // --- Machine selection → save ---

  const handleSelectMachine = async (machine: MachineStatus) => {
    setSaving(true);
    try {
      const displayName =
        name || machine.hostname || new URL(normalizedUrl).hostname;
      const serverId = crypto.randomUUID();

      // Save session BEFORE onDone triggers connectToServer
      const store = getServerStore();
      await store.saveServerSession(serverId, {
        sessionToken,
        machineId: machine.machine_id,
      });

      // Close the WS we opened for machine discovery
      wsRef.current?.close();

      onDone({
        id: serverId,
        name: displayName,
        type: 'e2ee',
        gatewayUrl: normalizedUrl,
        machineId: machine.machine_id,
      });
    } catch (err) {
      setMachineError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  const canTest = gatewayUrl.trim().length > 0;

  // --- Render ---

  if (step === 'gateway') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gateway-url">Gateway URL</Label>
          <Input
            id="gateway-url"
            placeholder="https://gateway.example.com"
            value={gatewayUrl}
            onChange={(e) => {
              setGatewayUrl(e.target.value);
              setTestOk(false);
            }}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="url"
          />
          <p className="text-xs text-muted-foreground">
            https:// is added automatically if omitted.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gateway-name">Name (optional)</Label>
          <Input
            id="gateway-name"
            placeholder="My Gateway"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>

        {testOk && (
          <output
            aria-live="polite"
            className="block rounded-sm bg-green-500/10 p-3 text-green-600 dark:text-green-400 text-xs"
          >
            Gateway reachable
          </output>
        )}

        {testError && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-sm bg-destructive/10 p-3 text-destructive text-xs"
          >
            {testError}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={!canTest || testing}
          >
            {testing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Test
          </Button>
          <Button size="sm" onClick={() => setStep('login')} disabled={!testOk}>
            Next
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'login') {
    return (
      <form onSubmit={handleLogin} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Sign in to <span className="font-medium">{normalizedUrl}</span>
        </p>

        <div className="space-y-2">
          <Label htmlFor="e2ee-email">Email</Label>
          <Input
            id="e2ee-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={loginLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="e2ee-password">Password</Label>
          <Input
            id="e2ee-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={loginLoading}
            minLength={8}
          />
        </div>

        {loginError && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-sm bg-destructive/10 p-3 text-destructive text-xs"
          >
            {loginError}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep('gateway')}
            disabled={loginLoading}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
          <div className="flex-1" />
          <Button type="submit" size="sm" disabled={loginLoading}>
            {loginLoading && (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            )}
            Sign In
          </Button>
        </div>
      </form>
    );
  }

  // step === 'machines'
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Select the machine to connect to.
      </p>

      {machineLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading machines...
          </span>
        </div>
      )}

      {machineError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-sm bg-destructive/10 p-3 text-destructive text-xs"
        >
          {machineError}
        </div>
      )}

      {!machineLoading && machines.length === 0 && !machineError && (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No machines online.
        </div>
      )}

      {machines.length > 0 && (
        <div className="grid gap-2">
          {machines.map((m) => (
            <button
              key={m.machine_id}
              className="flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted transition-colors active:bg-muted disabled:opacity-50"
              onClick={() => handleSelectMachine(m)}
              disabled={saving}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {m.hostname || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {m.platform || m.machine_id.slice(0, 8)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            wsRef.current?.close();
            setStep('login');
          }}
          disabled={saving}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back
        </Button>
      </div>
    </div>
  );
}
