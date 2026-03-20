/**
 * RemoteWs — WebSocket-compatible interface that connects to
 * a remote machine through an E2EE gateway connection.
 *
 * Implements the same event handler pattern as native WebSocket
 * (onopen, onmessage, onclose, onerror, send, close, readyState)
 * so existing hooks can use it as a drop-in replacement.
 */

export type WsEventHandler<T = Event> = ((event: T) => void) | null;

export class RemoteWs {
  // WebSocket readyState constants
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState: number = RemoteWs.CONNECTING;

  onopen: WsEventHandler = null;
  onmessage: WsEventHandler<MessageEvent> = null;
  onclose: WsEventHandler<CloseEvent> = null;
  onerror: WsEventHandler = null;

  private _listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map();

  constructor(
    public readonly id: number,
    private sendData: (id: number, data: string) => void,
    private sendClose: (id: number) => void
  ) {}

  /** Called by E2EEConnection when ws_opened is received */
  _onOpened(): void {
    this.readyState = RemoteWs.OPEN;
    const event = new Event('open');
    this.onopen?.(event);
    this._dispatch('open', event);
  }

  /** Called by E2EEConnection when ws_data is received */
  _onData(data: string): void {
    const event = new MessageEvent('message', { data });
    this.onmessage?.(event);
    this._dispatch('message', event);
  }

  /** Called by E2EEConnection when ws_closed is received */
  _onClosed(code = 1000, reason = ''): void {
    this.readyState = RemoteWs.CLOSED;
    const event = new CloseEvent('close', { code, reason, wasClean: true });
    this.onclose?.(event);
    this._dispatch('close', event);
  }

  /** Called by E2EEConnection on error */
  _onError(): void {
    const event = new Event('error');
    this.onerror?.(event);
    this._dispatch('error', event);
  }

  /** Send string data to remote */
  send(data: string | ArrayBuffer | Blob): void {
    if (this.readyState !== RemoteWs.OPEN) {
      throw new DOMException('WebSocket is not open', 'InvalidStateError');
    }
    // Convert to base64 string for the bridge protocol
    let str: string;
    if (typeof data === 'string') {
      str = btoa(unescape(encodeURIComponent(data)));
    } else if (data instanceof ArrayBuffer) {
      str = btoa(String.fromCharCode(...new Uint8Array(data)));
    } else {
      // Blob — not commonly used in our codebase, ignore for now
      console.warn('RemoteWs: Blob send not supported');
      return;
    }
    this.sendData(this.id, str);
  }

  /** Close the remote WebSocket */
  close(code?: number, reason?: string): void {
    // code and reason are accepted for WebSocket API compatibility
    void code;
    void reason;
    if (
      this.readyState === RemoteWs.CLOSED ||
      this.readyState === RemoteWs.CLOSING
    ) {
      return;
    }
    this.readyState = RemoteWs.CLOSING;
    this.sendClose(this.id);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    this._listeners.get(type)?.delete(listener);
  }

  private _dispatch(type: string, event: Event): void {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      if (typeof listener === 'function') {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}
