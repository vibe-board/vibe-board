/**
 * E2EEConnection — WebSocket connection to the gateway that transparently
 * proxies API requests to a remote machine via the E2EE gateway.
 *
 * When connected, replaces direct HTTP calls with encrypted messages.
 */
import {
  encryptJson,
  decryptJson,
  type EncryptedPayload,
  toBase64,
} from './envelope';
import { E2EEManager } from './manager';
import { RemoteWs } from './remoteWs';
import { wrapDek } from './crypto';

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
  | {
      type: 'machine_online';
      machine_id: string;
      hostname: string;
      platform: string;
      port: number;
    }
  | { type: 'machine_offline'; machine_id: string }
  | { type: 'forward'; machine_id: string; payload: unknown }
  | { type: 'error'; message: string };

export interface MachineStatus {
  machine_id: string;
  hostname: string;
  platform: string;
  port: number;
}

export class E2EEConnection {
  private ws: WebSocket | null = null;
  private dek: Uint8Array | null = null;
  private dekResolver: (() => void) | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private nextRequestId = 1;
  private nextWsStreamId = 1;
  private wsStreams: Map<number, RemoteWs> = new Map();
  private options: ConnectionOptions | null = null;
  private _connected = false;
  private _dekInFlight: Promise<void> | null = null;
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
  onMachinesChanged(callback: (machines: MachineStatus[]) => void): () => void {
    this.machineListeners.add(callback);
    return () => this.machineListeners.delete(callback);
  }

  /** Connect to the gateway and subscribe to a machine */
  async connect(options: ConnectionOptions): Promise<void> {
    // Reset DEK state for clean slate on new connection
    this.dek = null;
    this.dekResolver = null;
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
    // Close all remote WS streams
    for (const [id, stream] of this.wsStreams) {
      stream._onClosed(1001, 'Disconnected');
      this.wsStreams.delete(id);
    }

    if (this.ws) {
      // Clear event handlers BEFORE closing so the async onclose
      // doesn't fire onDisconnect (which would trigger auto-reconnect).
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.dek = null;
    this.dekResolver = null;
    this._dekInFlight = null;
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
   * Initialize DEK exchange with the remote machine.
   * Generates a random DEK, wraps it with the content public key,
   * and sends it to the machine via the gateway.
   */
  async initDek(): Promise<void> {
    if (!this._connected || !this.options) {
      throw new Error('Not connected');
    }

    // Skip if DEK already established
    if (this.dek) return;

    // If a DEK exchange is already in-flight, await it instead of starting another.
    // This prevents a race where both machine_online handler and connectToMachine
    // call initDek() concurrently, sending two different wrapped DEKs to the bridge.
    if (this._dekInFlight) {
      await this._dekInFlight;
      return;
    }

    this._dekInFlight = this._doDekExchange();
    try {
      await this._dekInFlight;
    } finally {
      this._dekInFlight = null;
    }
  }

  private async _doDekExchange(): Promise<void> {
    // Generate random 32-byte DEK
    const dek = crypto.getRandomValues(new Uint8Array(32));

    // Get content public key for this specific machine
    const manager = E2EEManager.getInstance();
    const publicKey = manager.getContentPublicKey(this.options!.machineId);
    if (!publicKey) {
      throw new Error('No content public key available for this machine');
    }

    // Wrap the DEK with the content public key
    const wrappedDek = wrapDek(dek, publicKey);

    // Base64 encode the wrapped DEK
    const wrappedDekB64 = toBase64(wrappedDek);

    // Create a promise that resolves when dek_ok is received
    const dekPromise = new Promise<void>((resolve, reject) => {
      this.dekResolver = resolve;
      setTimeout(() => {
        if (this.dekResolver === resolve) {
          this.dekResolver = null;
          reject(new Error('DEK exchange timeout'));
        }
      }, 10000);
    });

    // Send dek_exchange message
    this.send({
      type: 'forward',
      machine_id: this.options!.machineId,
      payload: {
        type: 'dek_exchange',
        wrapped_dek: wrappedDekB64,
      },
    });

    // Wait for dek_ok response
    await dekPromise;
    this.dek = dek;
  }

  /**
   * Send an HTTP request to the remote machine.
   * This replaces `fetch()` when connected to a remote machine.
   */
  async remoteFetch(
    url: string,
    init?: RequestInit,
    options?: { timeoutMs?: number }
  ): Promise<Response> {
    if (!this._connected || !this.options) {
      throw new Error('Not connected');
    }
    if (!this.dek) {
      throw new Error('DEK not established — pair with a master secret first');
    }

    const id = this.nextRequestId++;
    const method = init?.method ?? 'GET';
    let headers: [string, string][] = [];

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => headers.push([k, v]));
      } else if (Array.isArray(init.headers)) {
        headers.push(...(init.headers as [string, string][]));
      } else {
        Object.entries(init.headers).forEach(([k, v]) => headers.push([k, v]));
      }
    }

    let body: string | undefined;
    if (init?.body) {
      if (typeof init.body === 'string') {
        // Encode UTF-8 string to base64
        body = btoa(unescape(encodeURIComponent(init.body)));
      } else if (init.body instanceof ArrayBuffer) {
        body = toBase64(new Uint8Array(init.body));
      } else if (init.body instanceof FormData) {
        // Serialize FormData to multipart/form-data bytes
        const blob = await new Response(init.body).blob();
        // Extract the boundary from the generated Content-Type
        const contentType =
          new Response(init.body).headers.get('Content-Type') ?? '';
        if (contentType) {
          // Replace Content-Type header with the auto-generated multipart one
          headers = headers.filter(([k]) => k.toLowerCase() !== 'content-type');
          headers.push(['content-type', contentType]);
        }
        const arrayBuf = await blob.arrayBuffer();
        body = toBase64(new Uint8Array(arrayBuf));
      } else if (init.body instanceof Blob) {
        const arrayBuf = await init.body.arrayBuffer();
        body = toBase64(new Uint8Array(arrayBuf));
      }
    }

    const parsed = new URL(url, 'http://localhost');
    const request = {
      type: 'http_request' as const,
      id,
      method,
      path: parsed.pathname + parsed.search,
      headers,
      body,
    };

    // Send as forward message (encrypted with DEK)
    const payload = encryptJson(request, this.dek!);

    this.send({
      type: 'forward',
      machine_id: this.options.machineId,
      payload,
    });

    // Wait for response (longer timeout for uploads or caller-specified)
    const timeoutMs =
      options?.timeoutMs ?? (body && body.length > 10000 ? 120000 : 30000);
    const response = await new Promise<RemoteHttpResponse>(
      (resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });

        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error('Request timeout'));
          }
        }, timeoutMs);
      }
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

  /**
   * Open a WebSocket stream to the remote machine.
   * Returns a WebSocket-compatible object that can be used as a drop-in
   * replacement for `new WebSocket(url)`.
   */
  openWsStream(path: string, query?: string): RemoteWs {
    if (!this._connected || !this.options) {
      throw new Error('Not connected');
    }
    if (!this.dek) {
      throw new Error('DEK not established — pair with a master secret first');
    }

    const id = this.nextWsStreamId++;
    const remote = new RemoteWs(
      id,
      (wsId, data) => this.sendWsData(wsId, data),
      (wsId) => this.closeWsStream(wsId)
    );
    this.wsStreams.set(id, remote);

    // Send WsOpen request via the bridge
    const request = {
      type: 'ws_open' as const,
      id,
      path,
      ...(query ? { query } : {}),
    };

    const payload = encryptJson(request, this.dek!);
    this.send({
      type: 'forward',
      machine_id: this.options.machineId,
      payload,
    });

    return remote;
  }

  /** Send data over a remote WebSocket stream */
  private sendWsData(id: number, base64Data: string): void {
    if (!this._connected || !this.options) return;

    const request = {
      type: 'ws_data' as const,
      id,
      data: base64Data,
    };

    const payload = encryptJson(request, this.dek!);
    this.send({
      type: 'forward',
      machine_id: this.options.machineId,
      payload,
    });
  }

  /** Close a remote WebSocket stream */
  private closeWsStream(id: number): void {
    if (!this._connected || !this.options) {
      this.wsStreams.delete(id);
      return;
    }

    const request = {
      type: 'ws_close' as const,
      id,
    };

    const payload = encryptJson(request, this.dek!);
    this.send({
      type: 'forward',
      machine_id: this.options.machineId,
      payload,
    });

    this.wsStreams.delete(id);
  }

  private handleMessage(
    msg: GatewayMessage,
    connectResolve?: (value: void) => void,
    connectReject?: (error: Error) => void
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
            {
              machine_id: msg.machine_id,
              hostname: msg.hostname || '',
              platform: msg.platform || '',
              port: msg.port || 0,
            },
          ];
          this.machineListeners.forEach((cb) => cb(this._machines));
        }
        // Bridge reconnected — re-init DEK if we're subscribed to this machine
        if (msg.machine_id === this.options?.machineId && this._connected) {
          this.dek = null;
          this.initDek().catch((e) =>
            console.error('DEK re-init after bridge reconnect failed:', e)
          );
        }
        break;

      case 'machine_offline':
        this._machines = this._machines.filter(
          (m) => m.machine_id !== msg.machine_id
        );
        this.machineListeners.forEach((cb) => cb(this._machines));
        // Bridge disconnected — invalidate DEK (bridge will have fresh state on reconnect)
        if (msg.machine_id === this.options?.machineId) {
          this.dek = null;
        }
        break;

      case 'forward': {
        // Handle forwarded response from daemon
        let payload = msg.payload as Record<string, unknown>;

        // If encrypted, decrypt with DEK
        if (payload?.t === 'encrypted' && this.dek) {
          try {
            payload = decryptJson(
              payload as unknown as EncryptedPayload,
              this.dek
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

    // Handle DEK exchange response
    if (type === 'dek_ok') {
      if (this.dekResolver) {
        this.dekResolver();
        this.dekResolver = null;
      }
      return;
    }

    // Handle WebSocket sub-connection responses
    if (type === 'ws_opened') {
      const stream = this.wsStreams.get(id);
      if (stream) stream._onOpened();
      return;
    }

    if (type === 'ws_data') {
      const stream = this.wsStreams.get(id);
      if (stream) {
        // Decode base64 data back to UTF-8 string
        const raw = payload.data as string;
        const decoded = decodeURIComponent(escape(atob(raw)));
        stream._onData(decoded);
      }
      return;
    }

    if (type === 'ws_closed') {
      const stream = this.wsStreams.get(id);
      if (stream) {
        stream._onClosed();
        this.wsStreams.delete(id);
      }
      return;
    }

    // Handle HTTP request/response pending
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
          new Error((payload.message as string) ?? 'Unknown error')
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
