export type ServerType = 'direct' | 'e2ee';

export interface BaseServerConfig {
  id: string;
  name: string;
  type: ServerType;
  createdAt?: string;
  lastConnectedAt?: string | null;
}

export interface DirectServerConfig extends BaseServerConfig {
  type: 'direct';
  /** Full base URL e.g. "http://192.168.1.100:3000" */
  url: string;
}

export interface E2EEServerConfig extends BaseServerConfig {
  type: 'e2ee';
  gatewayUrl: string;
  machineId?: string;
}

export type ServerConfig = DirectServerConfig | E2EEServerConfig;

export type ServerConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface ActiveServerState {
  config: ServerConfig;
  status: ServerConnectionStatus;
  error?: string;
}

export function getServerAddress(config: ServerConfig): string {
  if (config.type === 'direct') {
    return config.url;
  }
  return config.gatewayUrl;
}

export function getServerBaseUrl(config: DirectServerConfig): string {
  return config.url.replace(/\/$/, '');
}
