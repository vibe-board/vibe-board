// frontend/src/lib/connections/types.ts
import type { QueryClient } from '@tanstack/react-query';

export type ConnectionStatus =
  | 'disconnected'
  | 'authenticating'
  | 'authenticated'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WebSocketLike {
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string): void;
  close(): void;
  readonly readyState: number;
}

export interface UnifiedConnection {
  readonly id: string;
  readonly type: 'direct' | 'gateway';
  readonly url: string;
  readonly label: string;
  readonly queryClient: QueryClient;

  status: ConnectionStatus;
  error: string | null;

  fetch(
    path: string,
    init?: RequestInit,
    extra?: { timeoutMs?: number }
  ): Promise<Response>;
  openWs(path: string, query?: string): WebSocketLike;
  listProjects(): Promise<ConnectionProject[]>;
  connect(): Promise<void>;
  disconnect(): void;

  /** Subscribe to status changes */
  onStatusChange(
    cb: (status: ConnectionStatus, error: string | null) => void
  ): () => void;
}

export interface ConnectionProject {
  id: string;
  name: string;
  path?: string;
}

export interface GatewaySession {
  sessionToken: string;
  userId: string;
}

export interface ConnectionEntryPersisted {
  id: string;
  type: 'gateway' | 'direct';
  url: string;
  label?: string;
}

export interface TabPersisted {
  id: string;
  type: 'home' | 'project' | 'machine-projects';
  connectionId?: string;
  machineId?: string;
  projectId?: string;
  label: string;
}
