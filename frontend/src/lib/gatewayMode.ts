// frontend/src/lib/gatewayMode.ts
/**
 * Module-level connection accessor for non-React code (api.ts, utils).
 * Set by ConnectionProvider when a tab's connection becomes active.
 */
import type { UnifiedConnection } from '@/lib/connections/types';
import type { RemoteWs } from '@/lib/e2ee/remoteWs';

let activeConnection: UnifiedConnection | null = null;

/** Set the active connection (called by ConnectionProvider on mount/update).
 *  Accepts a value or a callback that receives the current connection. */
export function setActiveConnection(
  conn:
    | UnifiedConnection
    | null
    | ((prev: UnifiedConnection | null) => UnifiedConnection | null)
): void {
  if (typeof conn === 'function') {
    activeConnection = conn(activeConnection);
  } else {
    activeConnection = conn;
  }
}

/** Get the active connection (used by makeRequest in api.ts) */
export function getActiveConnection(): UnifiedConnection | null {
  return activeConnection;
}

// Legacy compatibility — these are used by code that hasn't been migrated yet.
// They delegate to the active connection.
export function getGatewayConnection(): {
  remoteFetch: UnifiedConnection['fetch'];
  openWsStream: (path: string, query?: string) => RemoteWs;
} | null {
  if (!activeConnection || activeConnection.type !== 'gateway') return null;
  const conn = activeConnection;
  return {
    remoteFetch: conn.fetch.bind(conn),
    openWsStream: (path: string, query?: string): RemoteWs =>
      conn.openWs(path, query) as unknown as RemoteWs,
  };
}

export function setGatewayConnection(_conn?: unknown): void {
  // no-op — managed by setActiveConnection now
}

export async function detectGatewayMode(): Promise<boolean> {
  return activeConnection?.type === 'gateway';
}

export function isGatewayMode(): boolean {
  return activeConnection?.type === 'gateway';
}
