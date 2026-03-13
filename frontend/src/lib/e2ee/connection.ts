/**
 * E2EEConnection — WebSocket connection to the gateway that transparently
 * proxies API requests to a remote machine via the E2EE gateway.
 *
 * When connected, replaces direct HTTP calls with encrypted messages.
 */
import { encryptJson, decryptJson, type EncryptedPayload } from './envelope';

export interface ConnectionOptions {
  gatewayUrl: string;
  sessionToken: string;
  machineId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

interface PendingRequest {
  resolve: (response: RemoteHttpResponse) => void;
  reject: (error: Error) => void;
}

interface RemoteHttpResponse {
  status: number;
  headers: [string, string][];
  body: string; // base64
}

type GatewayMessage =
  | { type: 'auth_ok'; user_id: string }
  | { type: 'auth_error'; message: string }
  | { type: 'machines'; machines: MachineStatus[] }
  | { type: 'machine_online'; machine_id: string }
  | { type: 'machine_offline'; machine_id: string }
  | { type: 'forward'; machine_id: string; payload: unknown }
  | { type: 'error'; message: string };

export interface MachineStatus {
  machine_id: string;
  hostname: string;
  platform: string;
}

export class E2EEConnection {
  private ws: WebSocket | null = null;
  private dek: Uint8Array | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private nextRequestId = 1;
  private options: ConnectionOptions | null = null;
  private _connected = false;
  private _machines: MachineStatus[] = [];
  private machineListeners: Set<(machines: MachineStatus[]) => void> =
    new Set();

  get connected(): boolean {
    return this._connected;
  }

  get machines(): MachineStatus[] {
    return this._machines;
  }

  /** Subscribe to machine list changes */
  onMachinesChanged(
    callback: (machines: MachineStatus[]) => void,
  ): () => void {
    this.machineListeners.add(callback);
    return () => this.machineListeners.delete(callback);
  }

  /** Connect to the gateway and subscribe to a machine */
  async connect(options: ConnectionOptions): Promise<void> {
    this.options = options;

    const wsUrl = options.gatewayUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');

    const connectUrl = `${wsUrl}/ws/webui?token=${encodeURIComponent(options.sessionToken)}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(connectUrl);

      this.ws.onopen = () => {
        // Wait for auth_ok before resolving
      };

      this.ws.onmessage = (event) => {
        const msg: GatewayMessage = JSON.parse(event.data);
        this.handleMessage(msg, resolve, reject);
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.rejectAllPending('Connection closed');
        this.options?.onDisconnect?.();
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  /** Disconnect from the gateway */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.dek = null;
    this.rejectAllPending('Disconnected');
  }

  /** Subscribe to a specific machine */
  subscribeMachine(machineId: string): void {
    this.send({ type: 'subscribe', machine_id: machineId });
  }

  /** Unsubscribe from a machine */
  unsubscribeMachine(machineId: string): void {
    this.send({ type: 'unsubscribe', machine_id: machineId });
  }

  /**
   * Send an HTTP request to the remote machine.
   * This replaces `fetch()` when connected to a remote machine.
   */
  async remoteFetch(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    if (!this._connected || !this.options) {
      throw new Error('Not connected');
    }

    const id = this.nextRequestId++;
    const method = init?.method ?? 'GET';
    const headers: [string, string][] = [];

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => headers.push([k, v]));
      } else if (Array.isArray(init.headers)) {
        headers.push(
          ...(init.headers as [string, string][]),
        );
      } else {
        Object.entries(init.headers).forEach(([k, v]) =>
          headers.push([k, v]),
        );
      }
    }

    let body: string | undefined;
    if (init?.body) {
      if (typeof init.body === 'string') {
        body = btoa(init.body);
      } else if (init.body instanceof ArrayBuffer) {
        body = btoa(
          String.fromCharCode(...new Uint8Array(init.body)),
        );
      }
    }

    const request = {
      type: 'http_request' as const,
      id,
      method,
      path: new URL(url, 'http://localhost').pathname,
      headers,
      body,
    };

    // Send as forward message (optionally encrypted with DEK)
    const payload = this.dek
      ? encryptJson(request, this.dek)
      : request;

    this.send({
      type: 'forward',
      machine_id: this.options.machineId,
      payload,
    });

    // Wait for response
    const response = await new Promise<RemoteHttpResponse>(
      (resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error('Request timeout'));
          }
        }, 30000);
      },
    );

    // Decode body from base64
    const bodyBytes = atob(response.body);
    const bodyArray = new Uint8Array(bodyBytes.length);
    for (let i = 0; i < bodyBytes.length; i++) {
      bodyArray[i] = bodyBytes.charCodeAt(i);
    }

    // Build Response object
    const respHeaders = new Headers();
    for (const [k, v] of response.headers) {
      respHeaders.set(k, v);
    }

    return new Response(bodyArray, {
      status: response.status,
      headers: respHeaders,
    });
  }

  private handleMessage(
    msg: GatewayMessage,
    connectResolve?: (value: void) => void,
    connectReject?: (error: Error) => void,
  ): void {
    switch (msg.type) {
      case 'auth_ok':
        this._connected = true;
        this.options?.onConnect?.();
        connectResolve?.();
        break;

      case 'auth_error':
        this.options?.onError?.(msg.message);
        connectReject?.(new Error(msg.message));
        break;

      case 'machines':
        this._machines = msg.machines;
        this.machineListeners.forEach((cb) => cb(this._machines));
        break;

      case 'machine_online':
        if (!this._machines.find((m) => m.machine_id === msg.machine_id)) {
          this._machines = [
            ...this._machines,
            { machine_id: msg.machine_id, hostname: '', platform: '' },
          ];
          this.machineListeners.forEach((cb) => cb(this._machines));
        }
        break;

      case 'machine_offline':
        this._machines = this._machines.filter(
          (m) => m.machine_id !== msg.machine_id,
        );
        this.machineListeners.forEach((cb) => cb(this._machines));
        break;

      case 'forward': {
        // Handle forwarded response from daemon
        let payload = msg.payload as Record<string, unknown>;

        // If encrypted, decrypt with DEK
        if (payload?.t === 'encrypted' && this.dek) {
          try {
            payload = decryptJson(
              payload as unknown as EncryptedPayload,
              this.dek,
            );
          } catch (e) {
            console.error('Failed to decrypt payload:', e);
            return;
          }
        }

        this.handleResponsePayload(payload);
        break;
      }

      case 'error':
        console.error('Gateway error:', msg.message);
        this.options?.onError?.(msg.message);
        break;
    }
  }

  private handleResponsePayload(payload: Record<string, unknown>): void {
    const type = payload.type as string;
    const id = payload.id as number;

    if (!id || !this.pendingRequests.has(id)) return;

    const pending = this.pendingRequests.get(id)!;
    this.pendingRequests.delete(id);

    switch (type) {
      case 'http_response':
        pending.resolve({
          status: payload.status as number,
          headers: payload.headers as [string, string][],
          body: payload.body as string,
        });
        break;

      case 'error':
        pending.reject(
          new Error((payload.message as string) ?? 'Unknown error'),
        );
        break;

      case 'pong':
        // Keepalive response — just resolve with empty success
        pending.resolve({ status: 200, headers: [], body: btoa('') });
        break;

      default:
        console.warn('Unknown response payload type:', type);
        break;
    }
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }
}
