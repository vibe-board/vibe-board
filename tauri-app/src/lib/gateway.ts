import { E2EEManager, E2EEConnection } from './crypto';

let e2eeConnection: E2EEConnection | null = null;

export function getE2eeConnection(): E2EEConnection | null {
  return e2eeConnection;
}

export interface GatewayAuthResult {
  userId: string;
  machines: Array<{
    machine_id: string;
    hostname: string;
    platform: string;
  }>;
}

export async function connectToGateway(
  gatewayUrl: string,
  sessionToken: string,
  machineId: string
): Promise<{ connection: E2EEConnection; machines: GatewayAuthResult['machines'] }> {
  const conn = new E2EEConnection();

  return new Promise((resolve, reject) => {
    let machines: GatewayAuthResult['machines'] = [];

    conn
      .connect({
        gatewayUrl,
        sessionToken,
        machineId,
        onConnect: () => {
          resolve({ connection: conn, machines });
        },
        onDisconnect: () => {
          e2eeConnection = null;
        },
        onError: (err) => {
          if (!conn.connected) {
            reject(new Error(err));
          }
        },
      })
      .catch(reject);

    conn.onMachinesChanged((m) => {
      machines = m;
    });
  });
}

export function setE2eeConnection(conn: E2EEConnection | null): void {
  e2eeConnection = conn;
}

export function disconnectGateway(): void {
  if (e2eeConnection) {
    e2eeConnection.disconnect();
    e2eeConnection = null;
  }
}

export async function checkRegistrationStatus(
  gatewayUrl: string
): Promise<{ registered: boolean; userId?: string }> {
  const resp = await fetch(`${gatewayUrl}/api/gateway/registration-status`);
  if (!resp.ok) return { registered: false };
  return resp.json();
}

export async function gatewaySignup(
  gatewayUrl: string,
  data: { username: string; password: string }
): Promise<{ userId: string; masterSecret: string }> {
  const resp = await fetch(`${gatewayUrl}/api/gateway/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error('Signup failed');
  return resp.json();
}

export async function gatewayLogin(
  gatewayUrl: string,
  data: { username: string; password: string }
): Promise<{ sessionToken: string; userId: string }> {
  const resp = await fetch(`${gatewayUrl}/api/gateway/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error('Login failed');
  return resp.json();
}

export async function gatewayGetMachines(
  gatewayUrl: string,
  sessionToken: string
): Promise<Array<{ machine_id: string; hostname: string; platform: string }>> {
  const resp = await fetch(`${gatewayUrl}/api/gateway/machines`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!resp.ok) throw new Error('Failed to get machines');
  return resp.json();
}

export { E2EEManager };
