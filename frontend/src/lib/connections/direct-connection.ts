// frontend/src/lib/connections/direct-connection.ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
import type {
  UnifiedConnection,
  ConnectionStatus,
  WebSocketLike,
  ConnectionProject,
} from './types';

export class DirectConnection implements UnifiedConnection {
  readonly type = 'direct' as const;
  readonly queryClient: QueryClient;

  status: ConnectionStatus = 'disconnected';
  error: string | null = null;

  private statusListeners = new Set<
    (status: ConnectionStatus, error: string | null) => void
  >();

  constructor(
    readonly id: string,
    readonly url: string,
    readonly label: string
  ) {
    this.queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          console.error('[DirectConnection QueryError]', {
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
    this.setStatus('connecting');
    try {
      const resp = await window.fetch(`${this.url}/api/config/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      this.setStatus('connected');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      this.setStatus('error', msg);
      throw e;
    }
  }

  disconnect(): void {
    this.setStatus('disconnected');
  }

  async fetch(
    path: string,
    init?: RequestInit,
    _extra?: { timeoutMs?: number }
  ): Promise<Response> {
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return window.fetch(`${this.url}${path}`, { ...init, headers });
  }

  openWs(path: string, query?: string): WebSocketLike {
    const wsUrl = this.url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const fullPath = query ? `${path}?${query}` : path;
    return new WebSocket(`${wsUrl}${fullPath}`) as unknown as WebSocketLike;
  }

  async listProjects(): Promise<ConnectionProject[]> {
    const resp = await this.fetch('/api/projects');
    if (!resp.ok) throw new Error(`Failed to list projects: ${resp.status}`);
    const data = await resp.json();
    return (data as Array<{ id: string; name: string; path?: string }>).map(
      (p) => ({
        id: String(p.id),
        name: p.name,
        path: p.path,
      })
    );
  }
}
