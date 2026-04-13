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
    readonly gatewayUrl: string
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
      const raw = localStorage.getItem(
        `vb_gateway_session_${this.connectionId}`
      );
      if (raw) this.session = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }

  /** Save session to localStorage */
  private saveSession(): void {
    if (this.session) {
      localStorage.setItem(
        `vb_gateway_session_${this.connectionId}`,
        JSON.stringify(this.session)
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
    const wsUrl = this.gatewayUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');
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
            this.machines = [
              ...this.machines,
              {
                machine_id: msg.machine_id,
                hostname: msg.hostname || '',
                platform: msg.platform || '',
                port: msg.port || 0,
              },
            ];
            this.notify();
          }
        } else if (msg.type === 'machine_offline') {
          this.machines = this.machines.filter(
            (m) => m.machine_id !== msg.machine_id
          );
          this.notify();
        }
      } catch {
        /* ignore */
      }
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
      const resp = await fetch(
        `${this.gatewayUrl}/api/auth/registration-status`
      );
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
        machineId
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
