// frontend/src/lib/connections/deadWebSocket.ts
import type { WebSocketLike } from './types';

/**
 * A WebSocketLike that is already dead. Used as a non-throwing backstop when a
 * gateway machine connection cannot open a real stream (not connected / no DEK).
 *
 * On the next macrotask it fires onerror then a CLEAN onclose(1000) — terminal
 * for useJsonPatchWsStream and useLogStream (they don't reconnect on 1000/clean).
 * The real recovery path is Layer 2 (status flip → <App/> unmount).
 */
export function createDeadWebSocket(reason: string): WebSocketLike {
  let closed = false;

  const ws: WebSocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    readyState: 3, // CLOSED
    send() {
      /* dead — drop */
    },
    close() {
      closed = true;
    },
  };

  setTimeout(() => {
    if (closed) return;
    closed = true;
    ws.onerror?.(new Event('error'));
    ws.onclose?.(
      new CloseEvent('close', { code: 1000, reason, wasClean: true })
    );
  }, 0);

  return ws;
}
