/**
 * Module-level singleton for the active server connection.
 *
 * Replaces the old gatewayMode.ts as the central routing point.
 * Three modes:
 *  - e2ee:        E2EE WebSocket connection (remoteFetch / openWsStream)
 *  - direct:      HTTP to a remote base URL (Tauri desktop)
 *  - same-origin: Standard browser fetch (no prefix, no E2EE)
 */
import type { E2EEConnection } from '@/lib/e2ee';

export interface ActiveServer {
  type: 'direct' | 'e2ee' | 'same-origin';
  /** Base URL for direct mode, e.g. "http://localhost:3001" */
  baseUrl?: string;
  /** E2EE connection for gateway mode */
  connection?: E2EEConnection;
}

// --------------- singleton state ---------------

let activeServer: ActiveServer | null = null;
let connectionId = 0;
const listeners = new Set<() => void>();

// --------------- public API ---------------

export function setActiveServer(server: ActiveServer | null): void {
  activeServer = server;
  connectionId++;
  listeners.forEach((cb) => cb());
}

export function getActiveServer(): ActiveServer | null {
  return activeServer;
}

export function getConnectionId(): number {
  return connectionId;
}

/** Backward-compatible: used by existing getGatewayConnection() callers */
export function getGatewayConnection(): E2EEConnection | null {
  return activeServer?.connection ?? null;
}

// --------------- useSyncExternalStore support ---------------

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSnapshot(): ActiveServer | null {
  return activeServer;
}

export function getConnectionIdSnapshot(): number {
  return connectionId;
}
