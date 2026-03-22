import type { GatewayMachine, GatewaySession, EncryptedPayload } from '@/types';
import { encryptBridgeRequest, decryptBridgeResponse, createSignedAuthToken, type E2EEKeys } from './crypto';

type GatewayEvent =
  | { type: 'auth_ok'; user_id: string }
  | { type: 'auth_error'; message: string }
  | { type: 'machines'; machines: GatewayMachine[] }
  | { type: 'machine_online'; machine_id: string }
  | { type: 'machine_offline'; machine_id: string }
  | { type: 'forward'; machine_id: string; payload: EncryptedPayload }
  | { type: 'error'; message: string };

type GatewayEventHandler = (event: GatewayEvent) => void;

export class GatewayConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventHandlers = new Set<GatewayEventHandler>();
  private _machines: GatewayMachine[] = [];
  private _connected = false;
  private _authenticated = false;

  constructor(
    private gatewayUrl: string,
    private sessionToken: string,
    private e2eeKeys: E2EEKeys | null,
  ) {}

  get machines() { return this._machines; }
  get connected() { return this._connected; }
  get authenticated() { return this._authenticated; }

  on(handler: GatewayEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: GatewayEvent) {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const url = `${this.gatewayUrl}/ws/webui?token=${encodeURIComponent(this.sessionToken)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._connected = true;
    };

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as GatewayEvent;
        this.handleEvent(data);
      } catch {
        console.error('Failed to parse gateway message:', ev.data);
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this._authenticated = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._connected = false;
    };
  }

  private handleEvent(event: GatewayEvent) {
    switch (event.type) {
      case 'auth_ok':
        this._authenticated = true;
        break;
      case 'auth_error':
        this._authenticated = false;
        break;
      case 'machines':
        this._machines = event.machines;
        break;
      case 'machine_online':
        this._machines = this._machines.map((m) =>
          m.machine_id === event.machine_id ? { ...m, online: true } : m,
        );
        break;
      case 'machine_offline':
        this._machines = this._machines.map((m) =>
          m.machine_id === event.machine_id ? { ...m, online: false } : m,
        );
        break;
    }
    this.emit(event);
  }

  subscribe(machineId: string) {
    this.send({ type: 'subscribe', machine_id: machineId });
  }

  unsubscribe(machineId: string) {
    this.send({ type: 'unsubscribe', machine_id: machineId });
  }

  forwardToMachine(machineId: string, request: Parameters<typeof encryptBridgeRequest>[1]) {
    if (!this.e2eeKeys) return;
    const encrypted = encryptBridgeRequest(this.e2eeKeys.masterSecret, request);
    this.send({ type: 'forward', machine_id: machineId, payload: encrypted });
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
    this._authenticated = false;
  }
}
