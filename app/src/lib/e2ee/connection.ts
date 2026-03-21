import { E2EEManager } from './manager';
import { encryptJson, decryptJson, type EncryptedEnvelope } from './envelope';

interface PendingRequest {
  resolve: (value: Response) => void;
  reject: (reason: Error) => void;
}

export class E2EEConnection {
  private ws: WebSocket | null = null;
  private connectionId: string;
  private gatewayUrl: string;
  private pending = new Map<string, PendingRequest>();
  private manager: E2EEManager;

  constructor(connectionId: string, gatewayUrl: string) {
    this.connectionId = connectionId;
    this.gatewayUrl = gatewayUrl;
    this.manager = E2EEManager.getInstance();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.gatewayUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = () => {};
    });
  }

  async remoteFetch(path: string, init?: RequestInit): Promise<Response> {
    const requestId = crypto.randomUUID();
    const key = this.manager.getContentKey(this.connectionId);
    if (!key) throw new Error('No encryption key for this connection');

    const payload = {
      id: requestId,
      method: init?.method ?? 'GET',
      path,
      headers: init?.headers ?? {},
      body: init?.body ?? null,
    };

    const encrypted = encryptJson(payload, key);
    this.ws?.send(JSON.stringify({ type: 'forward', data: encrypted }));

    return new Promise<Response>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('Request timed out'));
        }
      }, 30000);
    });
  }

  private handleMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'response' && msg.data) {
        const key = this.manager.getContentKey(this.connectionId);
        if (!key) return;
        const decrypted = decryptJson<{ id: string; status: number; body: string }>(msg.data as EncryptedEnvelope, key);
        const pending = this.pending.get(decrypted.id);
        if (pending) {
          this.pending.delete(decrypted.id);
          pending.resolve(new Response(decrypted.body, { status: decrypted.status }));
        }
      }
    } catch {}
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    for (const [, req] of this.pending) {
      req.reject(new Error('Connection closed'));
    }
    this.pending.clear();
  }
}
