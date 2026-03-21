/**
 * Gateway mode detection and connection singleton.
 *
 * Backward-compatible shim — delegates to activeServer.ts internally.
 * Browser-mode GatewayProvider still calls setGatewayConnection/getGatewayConnection.
 */
import type { E2EEConnection } from '@/lib/e2ee';
import {
  setActiveServer,
  getActiveServer,
} from '@/lib/activeServer';

let gatewayMode: boolean | null = null;
let detectPromise: Promise<boolean> | null = null;

/**
 * Detect whether the frontend is served by an E2EE gateway.
 * Calls /api/gateway/info — if it returns { mode: "gateway" }, we're in gateway mode.
 * Result is cached after the first call.
 */
export async function detectGatewayMode(): Promise<boolean> {
  if (gatewayMode !== null) return gatewayMode;
  if (!detectPromise) {
    detectPromise = (async () => {
      try {
        const resp = await fetch('/api/gateway/info');
        if (resp.ok) {
          const data = await resp.json();
          gatewayMode = data.mode === 'gateway';
        } else {
          gatewayMode = false;
        }
      } catch {
        gatewayMode = false;
      }
      return gatewayMode!;
    })();
  }
  return detectPromise;
}

/** Synchronous check — only valid after detectGatewayMode() has resolved. */
export function isGatewayMode(): boolean {
  return gatewayMode ?? false;
}

/** Set the active E2EE connection (called by GatewayProvider when connected). */
export function setGatewayConnection(conn: E2EEConnection | null): void {
  if (conn) {
    setActiveServer({ type: 'e2ee', connection: conn });
  } else {
    setActiveServer(null);
  }
}

/** Get the active E2EE connection (used by makeRequest in api.ts). */
export function getGatewayConnection(): E2EEConnection | null {
  return getActiveServer()?.connection ?? null;
}
