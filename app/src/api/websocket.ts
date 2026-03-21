type MessageHandler = (data: unknown) => void;
type ConnectionHandler = () => void;

interface WSOptions {
  onMessage?: MessageHandler;
  onOpen?: ConnectionHandler;
  onClose?: ConnectionHandler;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  maxRetries?: number;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private options: WSOptions;
  private retries = 0;
  private closed = false;

  constructor(url: string, options: WSOptions = {}) {
    this.url = url;
    this.options = { reconnect: true, maxRetries: 10, ...options };
  }

  connect() {
    this.closed = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.retries = 0;
      this.options.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.options.onMessage?.(data);
      } catch {
        this.options.onMessage?.(event.data);
      }
    };

    this.ws.onclose = () => {
      this.options.onClose?.();
      if (!this.closed && this.options.reconnect && this.retries < (this.options.maxRetries ?? 10)) {
        const delay = Math.min(1000 * Math.pow(2, this.retries), 30000);
        this.retries++;
        setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = (e) => {
      this.options.onError?.(e);
    };
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  get readyState() {
    return this.ws?.readyState;
  }
}
