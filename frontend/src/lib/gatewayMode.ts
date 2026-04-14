// frontend/src/lib/gatewayMode.ts
/**
 * Legacy module-level connection state.
 * Used by ConnectionProvider to track which tab's connection is "active".
 * After the useApi() migration, this is only needed by ConnectionProvider's
 * synchronous render-time write to prevent race conditions.
 */
import type { UnifiedConnection } from '@/lib/connections/types';

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
