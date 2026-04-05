/**
 * Gateway mode detection and connection singleton for the mobile client.
 *
 * Unlike the desktop version which uses window.location.origin, the mobile
 * client takes the gateway URL from user input (connection store).
 */
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { E2EEConnection } from '@/lib/e2ee';

let currentConnection: E2EEConnection | null = null;

/**
 * Detect whether a URL points to an E2EE gateway.
 * Calls GET {gatewayUrl}/api/gateway/info — if it returns { mode: "gateway" }.
 */
export async function detectGatewayMode(gatewayUrl: string): Promise<boolean> {
  try {
    const url = gatewayUrl.replace(/\/$/, '') + '/api/gateway/info';
    const resp = await tauriFetch(url, { method: 'GET' });
    if (resp.ok) {
      const data = await resp.json();
      return data.mode === 'gateway';
    }
    return false;
  } catch {
    return false;
  }
}

/** Set the active E2EE connection (called by GatewayProvider when connected). */
export function setGatewayConnection(conn: E2EEConnection | null): void {
  currentConnection = conn;
}

/** Get the active E2EE connection (used by API client for gateway routing). */
export function getGatewayConnection(): E2EEConnection | null {
  return currentConnection;
}
