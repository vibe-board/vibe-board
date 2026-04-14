// streamJsonPatchEntries.ts - WebSocket JSON patch streaming utility
import type { Operation } from 'rfc6902';
import { applyUpsertPatch } from '@/utils/jsonPatch';
import { getActiveConnection } from '@/lib/gatewayMode';
import { getWsBaseUrl } from '@/lib/api';
import type { WebSocketLike } from '@/lib/connections/types';

type PatchContainer<E = unknown> = { entries: E[] };

export interface StreamOptions<E = unknown> {
  initial?: PatchContainer<E>;
  /** called after each successful patch application */
  onEntries?: (entries: E[]) => void;
  onConnect?: () => void;
  onError?: (err: unknown) => void;
  /** called once when a "finished" event is received */
  onFinished?: (entries: E[]) => void;
  /** If provided, enables auto-reconnect on unclean close */
  reconnect?: {
    maxRetries: number;
    /** Build the URL for reconnection given the highest entry index seen so far */
    getReconnectUrl: (maxEntryIndex: number) => string;
  };
}

interface StreamController<E = unknown> {
  /** Current entries array (immutable snapshot) */
  getEntries(): E[];
  /** Full { entries } snapshot */
  getSnapshot(): PatchContainer<E>;
  /** Best-effort connection state */
  isConnected(): boolean;
  /** True while attempting to reconnect after a drop */
  isReconnecting(): boolean;
  /** Subscribe to updates; returns an unsubscribe function */
  onChange(cb: (entries: E[]) => void): () => void;
  /** Close the stream (prevents further reconnection) */
  close(): void;
}

/**
 * Connect to a WebSocket endpoint that emits JSON messages containing:
 *   {"JsonPatch": [{"op": "add", "path": "/entries/0", "value": {...}}, ...]}
 *   {"Finished": ""}
 *
 * Maintains an in-memory { entries: [] } snapshot and returns a controller.
 */
export function streamJsonPatchEntries<E = unknown>(
  url: string,
  opts: StreamOptions<E> = {}
): StreamController<E> {
  let connected = false;
  let reconnecting = false;
  let closed = false; // set by close() to stop reconnection
  let finished = false;
  let ws: WebSocketLike | null = null;
  let retryAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let maxEntryIndex = -1;

  let snapshot: PatchContainer<E> = structuredClone(
    opts.initial ?? ({ entries: [] } as PatchContainer<E>)
  );

  const subscribers = new Set<(entries: E[]) => void>();
  if (opts.onEntries) subscribers.add(opts.onEntries);

  const notify = () => {
    for (const cb of subscribers) {
      try {
        cb(snapshot.entries);
      } catch {
        /* swallow subscriber errors */
      }
    }
  };

  /** Extract the highest /entries/{N} index from a set of patch ops */
  function updateMaxIndex(ops: Operation[]) {
    for (const op of ops) {
      const match = op.path.match(/^\/entries\/(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (idx > maxEntryIndex) {
          maxEntryIndex = idx;
        }
      }
    }
  }

  function handleMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(event.data);

      if (msg.JsonPatch) {
        const raw = msg.JsonPatch as Operation[];
        const ops = dedupeOps(raw);

        updateMaxIndex(ops);

        const next = structuredClone(snapshot);
        applyUpsertPatch(next, ops);

        if (JSON.stringify(next) === JSON.stringify(snapshot)) {
          return;
        }

        snapshot = next;
        notify();
      }

      if (msg.finished !== undefined) {
        finished = true;
        opts.onFinished?.(snapshot.entries);
        ws?.close();
      }
    } catch (err) {
      opts.onError?.(err);
    }
  }

  function scheduleReconnect() {
    if (closed || finished || !opts.reconnect) return;
    if (retryAttempts >= opts.reconnect.maxRetries) return;

    reconnecting = true;
    const delay = Math.min(8000, 500 * Math.pow(2, retryAttempts));
    retryAttempts++;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (closed || finished) return;
      const reconnectUrl = opts.reconnect!.getReconnectUrl(maxEntryIndex);
      openConnection(reconnectUrl);
    }, delay);
  }

  function openConnection(connectUrl: string) {
    const activeConn = getActiveConnection();
    if (activeConn) {
      const parsed = new URL(connectUrl, window.location.origin);
      ws = activeConn.openWs(
        parsed.pathname,
        parsed.search?.substring(1) || undefined
      );
    } else {
      const wsBase = getWsBaseUrl();
      const wsUrl = connectUrl.startsWith('/')
        ? `${wsBase}${connectUrl}`
        : connectUrl.replace(/^http/, 'ws');
      // Guard against invalid WebSocket schemes (e.g. tauri://)
      if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        retryAttempts += 1;
        scheduleReconnect();
        return;
      }
      ws = new WebSocket(wsUrl);
    }

    ws.onopen = () => {
      connected = true;
      reconnecting = false;
      retryAttempts = 0;
      opts.onConnect?.();
    };

    ws.onmessage = handleMessage;

    ws.onerror = (err) => {
      connected = false;
      opts.onError?.(err);
    };

    ws.onclose = () => {
      connected = false;
      ws = null;

      if (!closed && !finished) {
        scheduleReconnect();
      }
    };
  }

  // Initial connection
  openConnection(url);

  return {
    getEntries(): E[] {
      return snapshot.entries;
    },
    getSnapshot(): PatchContainer<E> {
      return snapshot;
    },
    isConnected(): boolean {
      return connected;
    },
    isReconnecting(): boolean {
      return reconnecting;
    },
    onChange(cb: (entries: E[]) => void): () => void {
      subscribers.add(cb);
      cb(snapshot.entries);
      return () => subscribers.delete(cb);
    },
    close(): void {
      closed = true;
      reconnecting = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      ws?.close();
      ws = null;
      subscribers.clear();
      connected = false;
    },
  };
}

/**
 * Dedupe multiple ops that touch the same path within a single event.
 * Last write for a path wins, while preserving the overall left-to-right
 * order of the *kept* final operations.
 *
 * Example:
 *   add /entries/4, replace /entries/4  -> keep only the final replace
 */
function dedupeOps(ops: Operation[]): Operation[] {
  const lastIndexByPath = new Map<string, number>();
  ops.forEach((op, i) => lastIndexByPath.set(op.path, i));

  // Keep only the last op for each path, in ascending order of their final index
  const keptIndices = [...lastIndexByPath.values()].sort((a, b) => a - b);
  return keptIndices.map((i) => ops[i]!);
}
