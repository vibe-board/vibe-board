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
  host: string;
  port: number;
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
    return `${config.host}:${config.port}`;
  }
  return config.gatewayUrl;
}

export function getServerBaseUrl(config: DirectServerConfig): string {
  const host = config.host;
  const port = config.port;
  const protocol =
    host === 'localhost' || host === '127.0.0.1' ? 'http' : 'https';
  return `${protocol}://${host}:${port}`;
}
