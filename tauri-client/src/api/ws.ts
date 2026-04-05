/**
 * WsConnection — unified WebSocket interface for both local (Tauri)
 * and gateway (E2EE tunnel) modes.
 *
 * Tauri WebSocket API:  addListener(cb) receives { type: 'Text'|'Binary'|'Close', data? }
 * RemoteWs API:         addEventListener('message', cb) receives MessageEvent
 *
 * Both adapters normalise to the same WsConnection interface so hooks
 * don't need to know which transport is active.
 */
import WebSocket from '@tauri-apps/plugin-websocket';
import type { RemoteWs } from '@/lib/e2ee/remoteWs';

export interface WsMessage {
  type: string;
  data?: string;
}

export interface WsConnection {
  addListener(cb: (msg: WsMessage) => void): void;
  send(data: string): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Adapter for Tauri's @tauri-apps/plugin-websocket.
 * Converts Tauri's Message union type to WsMessage.
 */
export class TauriWsAdapter implements WsConnection {
  constructor(private ws: WebSocket) {}

  addListener(cb: (msg: WsMessage) => void): void {
    this.ws.addListener((msg) => {
      // Tauri Message type has data as string (Text) or number[] (Binary/Ping/Pong)
      // or CloseFrame | null (Close). We normalise to string | undefined.
      if (msg.type === 'Text') {
        cb({ type: msg.type, data: msg.data as string });
      } else if (msg.type === 'Binary' || msg.type === 'Ping' || msg.type === 'Pong') {
        // Convert number[] to UTF-8 string
        const bytes = new Uint8Array(msg.data as number[]);
        const str = new TextDecoder().decode(bytes);
        cb({ type: msg.type, data: str });
      } else {
        // Close, or any other type
        cb({ type: msg.type });
      }
    });
  }

  send(data: string): Promise<void> {
    return this.ws.send(data);
  }

  disconnect(): Promise<void> {
    return this.ws.disconnect();
  }
}

/**
 * Adapter for RemoteWs (E2EE gateway tunnel).
 * Bridges RemoteWs's standard WebSocket API to WsConnection's Tauri-style API.
 */
export class GatewayWsAdapter implements WsConnection {
  constructor(private ws: RemoteWs) {}

  addListener(cb: (msg: WsMessage) => void): void {
    // RemoteWs fires 'message' via addEventListener with MessageEvent
    this.ws.addEventListener('message', (event: Event) => {
      const me = event as MessageEvent;
      cb({ type: 'Text', data: me.data as string });
    });
    // Also forward close events so hooks can handle them
    this.ws.addEventListener('close', () => {
      cb({ type: 'Close' });
    });
  }

  send(data: string): Promise<void> {
    this.ws.send(data);
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.ws.close();
    return Promise.resolve();
  }
}
