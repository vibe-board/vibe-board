// frontend/src/stores/migration.ts
import type { ConnectionEntryPersisted } from '@/lib/connections/types';

const MIGRATION_DONE_KEY = 'vb_migration_v1_done';

/**
 * One-time migration from old vk_ and vb- localStorage keys to new vb_ format.
 * Creates ConnectionEntry records from old single-connection config.
 */
export function runMigrationIfNeeded(): void {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  const connections: ConnectionEntryPersisted[] = [];

  // Migrate gateway URL
  const oldGatewayUrl = localStorage.getItem('vb-gateway-url');
  if (oldGatewayUrl) {
    const connId = crypto.randomUUID();
    connections.push({ id: connId, type: 'gateway', url: oldGatewayUrl });

    // Migrate session
    const oldSession = localStorage.getItem('vk_gateway_session');
    if (oldSession) {
      localStorage.setItem(`vb_gateway_session_${connId}`, oldSession);
      localStorage.removeItem('vk_gateway_session');
    }

    localStorage.removeItem('vb-gateway-url');
  }

  // Migrate direct backend URL
  const oldBackendUrl = localStorage.getItem('vb-backend-url');
  if (oldBackendUrl) {
    const connId = crypto.randomUUID();
    connections.push({ id: connId, type: 'direct', url: oldBackendUrl });
    localStorage.removeItem('vb-backend-url');
  }

  // Migrate E2EE machine secrets key name
  const oldSecrets = localStorage.getItem('vk_e2ee_machine_secrets');
  if (oldSecrets) {
    localStorage.setItem('vb_e2ee_machine_secrets', oldSecrets);
    localStorage.removeItem('vk_e2ee_machine_secrets');
  }

  // Also clean up the even older key
  localStorage.removeItem('vk_e2ee_secrets');

  // Clean up old selected machine keys
  localStorage.removeItem('vk_gateway_selected_machine');
  localStorage.removeItem('vk_gateway_last_machine');
  sessionStorage.removeItem('vk_gateway_selected_machine');

  // Save migrated connections
  if (connections.length > 0) {
    localStorage.setItem('vb_connections', JSON.stringify(connections));
  }

  localStorage.setItem(MIGRATION_DONE_KEY, '1');
}
