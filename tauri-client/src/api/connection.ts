import { apiClient } from './client';
import { detectGatewayMode } from '@/lib/gatewayMode';

export interface ConnectionConfig {
  serverUrl: string;
  token?: string;
  mode: 'local' | 'gateway';
}

export interface ConnectionResult {
  connected: boolean;
  mode: 'local' | 'gateway';
}

export async function testConnection(url: string): Promise<ConnectionResult> {
  try {
    apiClient.updateConnection(url);

    // Try gateway detection first (gateway servers expose /api/gateway/info)
    const isGateway = await detectGatewayMode(url);
    if (isGateway) {
      return { connected: true, mode: 'gateway' };
    }

    // Fall back to /health check for local servers
    await apiClient.get('/health');
    return { connected: true, mode: 'local' };
  } catch {
    return { connected: false, mode: 'local' };
  }
}

export async function connect(config: ConnectionConfig): Promise<boolean> {
  apiClient.updateConnection(config.serverUrl, config.token);
  const result = await testConnection(config.serverUrl);
  return result.connected;
}
