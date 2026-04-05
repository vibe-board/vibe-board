import { useEffect, useRef, useState, useCallback } from 'react';
import { applyPatch, type Operation } from 'rfc6902';
import { produce } from 'immer';
import { apiClient } from '../client';
import type { WsConnection } from '../ws';

// ── Types ──────────────────────────────────────────────────────────────────

type WsMessage =
  | { JsonPatch: Operation[] }
  | { Ready: true }
  | { finished: true };

export interface UseJsonPatchWsStreamOptions {
  /** Called when WS reconnects (not the first connect). Use to re-fetch REST state. */
  onReconnect?: () => void;
}

export interface UseJsonPatchWsStreamResult<T> {
  data: T | undefined;
  isConnected: boolean;
  isInitialized: boolean;
  error: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Apply an RFC 6902 patch to a draft, converting `replace` to `add` when
 * the target path doesn't exist yet (upsert semantics).
 */
export function applyUpsertPatch(draft: unknown, operations: Operation[]): void {
  const obj = draft as Record<string, unknown>;

  for (const op of operations) {
    if (op.op !== 'replace' || !('value' in op)) continue;

    // Check if path exists; if not, convert to add
    const segments = op.path.split('/').filter(Boolean);
    let current: unknown = obj;
    let pathExists = true;

    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i]!;
      if (
        current == null ||
        typeof current !== 'object' ||
        !(key in (current as Record<string, unknown>))
      ) {
        pathExists = false;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }

    const lastKey = segments[segments.length - 1]!;
    if (
      pathExists &&
      current != null &&
      typeof current === 'object' &&
      lastKey in (current as Record<string, unknown>)
    ) {
      // Path exists, replace is fine
      continue;
    }

    // Convert replace to add
    (op as unknown as { op: string }).op = 'add';
  }

  applyPatch(obj, operations);
}

// ── Hook ───────────────────────────────────────────────────────────────────

const MAX_BACKOFF_MS = 8000;
const BASE_BACKOFF_MS = 1000;

function getBackoffDelay(attempt: number): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  // Add ±20% jitter to prevent thundering herd
  return base * (0.8 + Math.random() * 0.4);
}

export function useJsonPatchWsStream<T>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options?: UseJsonPatchWsStreamOptions,
): UseJsonPatchWsStreamResult<T> {
  const [data, setData] = useState<T | undefined>();
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WsConnection | null>(null);
  const currentDataRef = useRef<T | undefined>(undefined);
  const endpointRef = useRef(endpoint);
  const enabledRef = useRef(enabled);
  const cleanedUpRef = useRef(false);
  const isStreamFinishedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialDataRef = useRef(initialData);
  const onReconnectRef = useRef(options?.onReconnect);
  const hasConnectedRef = useRef(false);

  // Keep refs in sync
  endpointRef.current = endpoint;
  enabledRef.current = enabled;
  initialDataRef.current = initialData;
  onReconnectRef.current = options?.onReconnect;

  const scheduleReconnect = useCallback((attempt: number) => {
    if (cleanedUpRef.current || !enabledRef.current || isStreamFinishedRef.current) return;
    const delay = getBackoffDelay(attempt);
    reconnectTimerRef.current = setTimeout(() => {
      connectRef.current(attempt + 1);
    }, delay);
  }, []);

  // Stable connect — uses refs instead of closures so it doesn't change per render.
  // This prevents the effect from re-running and recreating WS connections on every render.
  const connect = useCallback(
    async (attempt: number): Promise<void> => {
      if (!endpointRef.current || !enabledRef.current || cleanedUpRef.current)
        return;

      try {
        const ws = await apiClient.connectWs(endpointRef.current);
        // Guard: cleanup may have run while we were awaiting
        if (cleanedUpRef.current) {
          ws.disconnect().catch(() => {});
          return;
        }
        wsRef.current = ws;

        // Initialize state only on first connect (not reconnect).
        // On reconnect the server re-sends patches, so keeping existing data
        // avoids a flash of empty state for slash commands, scratch drafts, etc.
        if (!currentDataRef.current) {
          currentDataRef.current = initialDataRef.current();
          setData(currentDataRef.current);
        }

        // On reconnect (not first connect), notify caller so they can re-fetch REST
        if (hasConnectedRef.current && onReconnectRef.current) {
          onReconnectRef.current();
        }
        hasConnectedRef.current = true;
        setIsConnected(true);
        setError(null);

        ws.addListener((msg) => {
          if (msg.type === 'Close') {
            setIsConnected(false);
            scheduleReconnect(0);
            return;
          }

          if (msg.type !== 'Text') return;

          let parsed: WsMessage;
          try {
            parsed = JSON.parse(msg.data as string) as WsMessage;
          } catch {
            return;
          }

          if ('Ready' in parsed) {
            setIsInitialized(true);
            return;
          }

          if ('finished' in parsed) {
            // Stream ended, do NOT reconnect
            cleanedUpRef.current = true;
            isStreamFinishedRef.current = true;
            ws.disconnect().catch(() => {});
            setIsConnected(false);
            return;
          }

          if ('JsonPatch' in parsed) {
            const operations = parsed.JsonPatch as Operation[];
            setData((prev) => {
              const base = prev ?? initialDataRef.current();
              return produce(base, (draft) => {
                applyUpsertPatch(draft, operations);
              });
            });
          }
        });
      } catch (err) {
        // Guard: don't schedule reconnect if cleanup ran during await
        if (cleanedUpRef.current) return;
        const message =
          err instanceof Error ? err.message : 'WebSocket connection failed';
        setError(message);
        setIsConnected(false);

        // Exponential backoff on connection failure
        scheduleReconnect(attempt);
      }
    },
    [scheduleReconnect],
  );

  // Stable ref so scheduleReconnect can call connect without circular dep
  const connectRef = useRef(connect);
  connectRef.current = connect;

  useEffect(() => {
    if (!endpoint || !enabled) return;

    cleanedUpRef.current = false;
    isStreamFinishedRef.current = false;
    hasConnectedRef.current = false;
    currentDataRef.current = undefined;
    setData(undefined);
    setIsConnected(false);
    setIsInitialized(false);
    setError(null);

    connect(0);

    return () => {
      cleanedUpRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.disconnect().catch(() => {});
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [endpoint, enabled, connect]);

  return { data, isConnected, isInitialized, error };
}
