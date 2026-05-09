import { useConnectionStore } from '@/stores/connection-store';
import type { GatewaySession } from '@/lib/connections/types';
import type { MachineStatus } from '@/lib/e2ee';
import * as machineRegistry from './machine-registry';

const machineListSockets = new Map<string, WebSocket>();

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

// --- Machine list WS (filled in Task 2.4) ---
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
