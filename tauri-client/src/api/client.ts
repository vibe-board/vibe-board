import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import WebSocket from '@tauri-apps/plugin-websocket';
import { getGatewayConnection } from '@/lib/gatewayMode';
import { TauriWsAdapter, GatewayWsAdapter, type WsConnection } from './ws';

export class ApiClient {
  private baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token ?? null;
  }

  updateConnection(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token ?? null;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /**
   * Unwrap the server's ApiResponse { success, data, ... } envelope.
   * Every server endpoint returns this wrapper; callers expect the inner data.
   */
  private unwrap<T>(response: unknown): T {
    if (
      response != null &&
      typeof response === 'object' &&
      'success' in response
    ) {
      return (response as Record<string, unknown>).data as T;
    }
    return response as T;
  }

  /**
   * Route a request through the E2EE gateway connection if one is active,
   * otherwise use direct tauriFetch.
   * Adds a 15s timeout to prevent indefinite hanging on unstable connections.
   */
  private async request(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const REQUEST_TIMEOUT_MS = 15_000;
    const conn = getGatewayConnection();

    if (conn) {
      // remoteFetch ignores AbortSignal, so use Promise.race for timeout
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT_MS),
      );
      return Promise.race([conn.remoteFetch(url, options), timeout]);
    }

    // Direct fetch — use AbortController
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await tauriFetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}/api${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await this.request(url.toString(), { method: 'GET', headers: this.headers() });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    const raw = await res.json();
    const result = this.unwrap<T>(raw);
    return result;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.request(`${this.baseUrl}/api${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return this.unwrap<T>(await res.json());
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.request(`${this.baseUrl}/api${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return this.unwrap<T>(await res.json());
  }

  async postForm<T>(path: string, formData: FormData): Promise<T> {
    const res = await this.request(`${this.baseUrl}/api${path}`, {
      method: 'POST',
      headers: this.token
        ? { Authorization: `Bearer ${this.token}` }
        : {},
      body: formData,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return this.unwrap<T>(await res.json());
  }

  async delete<T>(path: string): Promise<T> {
    const res = await this.request(`${this.baseUrl}/api${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return this.unwrap<T>(await res.json());
  }

  wsUrl(path: string, params?: Record<string, string>): string {
    const wsBase = this.baseUrl.replace(/^http/, 'ws');
    const url = new URL(`${wsBase}/api${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  /**
   * Connect a WebSocket, routing through the E2EE gateway if one is active.
   * Returns a WsConnection that normalises both transport APIs.
   */
  async connectWs(path: string, params?: Record<string, string>): Promise<WsConnection> {
    const conn = getGatewayConnection();
    if (conn) {
      const queryString = params
        ? new URLSearchParams(params).toString()
        : undefined;
      const remote = conn.openWsStream(`/api${path}`, queryString);
      return new GatewayWsAdapter(remote);
    }
    const ws = await WebSocket.connect(this.wsUrl(path, params));
    return new TauriWsAdapter(ws);
  }
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API Error ${status}: ${body}`);
  }
}

// Singleton instance — updated by connection store
export const apiClient = new ApiClient('http://localhost:3001');
