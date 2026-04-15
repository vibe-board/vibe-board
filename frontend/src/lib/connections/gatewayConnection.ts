// frontend/src/lib/connections/gatewayConnection.ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
import { E2EEConnection } from '@/lib/e2ee';
import type {
  UnifiedConnection,
  ConnectionStatus,
  WebSocketLike,
  ConnectionProject,
  GatewaySession,
} from './types';

export class GatewayMachineConnection implements UnifiedConnection {
  readonly type = 'gateway' as const;
  readonly queryClient: QueryClient;

  status: ConnectionStatus = 'disconnected';
  error: string | null = null;

  private e2eeConn: E2EEConnection | null = null;
  private statusListeners = new Set<
    (status: ConnectionStatus, error: string | null) => void
  >();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private refCount = 0;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly id: string,
    readonly url: string,
    readonly label: string,
    private gatewayUrl: string,
    private session: GatewaySession,
    private machineId: string
  ) {
    this.queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          console.error('[GatewayMachineConnection QueryError]', {
            queryKey: query.queryKey,
            error,
          });
        },
      }),
      defaultOptions: {
        queries: { staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false },
      },
    });
  }

  /** Increment ref count — called when a tab opens on this machine */
  addRef(): void {
    this.refCount++;
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  /** Decrement ref count — called when a tab closes. Disconnects after 30s if refCount reaches 0. */
  removeRef(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.status === 'connected') {
      this.disconnectTimer = setTimeout(() => {
        if (this.refCount === 0) this.disconnect();
      }, 30_000);
    }
  }

  private setStatus(status: ConnectionStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((cb) => cb(status, error));
  }

  onStatusChange(
    cb: (status: ConnectionStatus, error: string | null) => void
  ): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async connect(): Promise<void> {
    if (this.status === 'connected' && this.e2eeConn) return;
    this.setStatus('connecting');
    this.reconnectAttempts = 0;

    try {
      await this.doConnect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      this.setStatus('error', msg);
      throw e;
    }
  }

  private async doConnect(): Promise<void> {
    const conn = new E2EEConnection();
    await conn.connect({
      gatewayUrl: this.gatewayUrl,
      sessionToken: this.session.sessionToken,
      machineId: this.machineId,
      onConnect: () => {
        this.reconnectAttempts = 0;
      },
      onDisconnect: () => {
        this.e2eeConn = null;
        this.attemptReconnect();
      },
      onError: (err) => {
        this.setStatus('error', err);
      },
    });
    conn.subscribeMachine(this.machineId);
    await conn.initDek();
    this.e2eeConn = conn;
    this.setStatus('connected');
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= 5) {
      this.setStatus('error', 'Connection lost');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      8000,
      1000 * Math.pow(2, this.reconnectAttempts - 1)
    );
    this.setStatus(
      'reconnecting',
      `Reconnecting... (attempt ${this.reconnectAttempts})`
    );
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.doConnect();
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    if (this.e2eeConn) {
      this.e2eeConn.disconnect();
      this.e2eeConn = null;
    }
    this.setStatus('disconnected');
  }

  async fetch(
    path: string,
    init?: RequestInit,
    extra?: { timeoutMs?: number }
  ): Promise<Response> {
    if (!this.e2eeConn) throw new Error('Not connected');
    return this.e2eeConn.remoteFetch(path, { ...init }, extra);
  }

  openWs(path: string, query?: string): WebSocketLike {
    if (!this.e2eeConn) throw new Error('Not connected');
    return this.e2eeConn.openWsStream(path, query) as unknown as WebSocketLike;
  }

  async listProjects(): Promise<ConnectionProject[]> {
    const resp = await this.fetch('/api/projects');
    if (!resp.ok) throw new Error(`Failed to list projects: ${resp.status}`);
    const envelope = await resp.json();
    const items = (envelope.data ?? envelope) as Array<{
      id: string;
      name: string;
      path?: string;
    }>;
    return items.map((p) => ({
      id: String(p.id),
      name: p.name,
      path: p.path,
    }));
  }

  /** Update session token (e.g. after re-login) */
  updateSession(session: GatewaySession): void {
    this.session = session;
  }
}
