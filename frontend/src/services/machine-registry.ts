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
