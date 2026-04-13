import { useEffect, useState, useRef } from 'react';
import { produce } from 'immer';
import type { Operation } from 'rfc6902';
import { applyUpsertPatch } from '@/utils/jsonPatch';
import { getActiveConnection } from '@/lib/gatewayMode';
import { getWsBaseUrl } from '@/lib/api';
import type { WebSocketLike } from '@/lib/connections/types';

type WsJsonPatchMsg = { JsonPatch: Operation[] };
type WsReadyMsg = { Ready: true };
type WsFinishedMsg = { finished: boolean };
type WsMsg = WsJsonPatchMsg | WsReadyMsg | WsFinishedMsg;

interface UseJsonPatchStreamOptions<T> {
  /**
   * Called once when the stream starts to inject initial data
   */
  injectInitialEntry?: (data: T) => void;
  /**
   * Filter/deduplicate patches before applying them
   */
  deduplicatePatches?: (patches: Operation[]) => Operation[];
}

interface UseJsonPatchStreamResult<T> {
  data: T | undefined;
  isConnected: boolean;
  isInitialized: boolean;
  error: string | null;
}

/**
 * Generic hook for consuming WebSocket streams that send JSON messages with patches
 */
export const useJsonPatchWsStream = <T extends object>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options?: UseJsonPatchStreamOptions<T>
): UseJsonPatchStreamResult<T> => {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocketLike | null>(null);
  const dataRef = useRef<T | undefined>(undefined);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef<number>(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const finishedRef = useRef<boolean>(false);
  const cleanupCalledRef = useRef<boolean>(false);

  // Store callbacks in refs so the connection effect doesn't re-run
  // when callers forget to memoize them
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;
  const injectInitialEntryRef = useRef(options?.injectInitialEntry);
  injectInitialEntryRef.current = options?.injectInitialEntry;
  const deduplicatePatchesRef = useRef(options?.deduplicatePatches);
  deduplicatePatchesRef.current = options?.deduplicatePatches;

  function scheduleReconnect() {
    if (retryTimerRef.current) return; // already scheduled
    // Exponential backoff with cap: 1s, 2s, 4s, 8s (max), then stay at 8s
    const attempt = retryAttemptsRef.current;
    const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRetryNonce((n) => n + 1);
    }, delay);
  }

  useEffect(() => {
    // Reset cleanup flag for this effect run — allows onclose to schedule reconnects
    cleanupCalledRef.current = false;

    if (!enabled || !endpoint) {
      // Close connection and reset state
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryAttemptsRef.current = 0;
      finishedRef.current = false;
      setData(undefined);
      setIsConnected(false);
      setIsInitialized(false);
      setError(null);
      dataRef.current = undefined;
      return;
    }

    // Initialize data
    if (!dataRef.current) {
      dataRef.current = initialDataRef.current();

      // Inject initial entry if provided
      if (injectInitialEntryRef.current) {
        injectInitialEntryRef.current(dataRef.current);
      }
    }

    // Create WebSocket if it doesn't exist
    if (!wsRef.current) {
      // Reset finished flag for new connection
      finishedRef.current = false;

      const activeConn = getActiveConnection();
      let ws: WebSocketLike;
      if (activeConn) {
        const url = new URL(endpoint, window.location.origin);
        ws = activeConn.openWs(
          url.pathname,
          url.search?.substring(1) || undefined
        );
      } else {
        const wsBase = getWsBaseUrl();
        const wsEndpoint = endpoint.startsWith('/')
          ? `${wsBase}${endpoint}`
          : endpoint.replace(/^http/, 'ws');
        ws = new WebSocket(wsEndpoint);
      }

      ws.onopen = () => {
        setError(null);
        setIsConnected(true);
        // Reset backoff on successful connection
        retryAttemptsRef.current = 0;
        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMsg = JSON.parse(event.data);

          // Handle JsonPatch messages (same as SSE json_patch event)
          if ('JsonPatch' in msg) {
            const patches: Operation[] = msg.JsonPatch;

            const dedupe = deduplicatePatchesRef.current;
            const filtered = dedupe ? dedupe(patches) : patches;

            const current = dataRef.current;
            if (!filtered.length || !current) return;

            // Use Immer for structural sharing - only modified parts get new references
            const next = produce(current, (draft) => {
              applyUpsertPatch(draft, filtered);
            });

            dataRef.current = next;
            setData(next);
          }

          // Handle Ready messages (initial data has been sent)
          if ('Ready' in msg) {
            setIsInitialized(true);
          }

          // Handle finished messages ({finished: true})
          // Treat finished as terminal - do NOT reconnect
          if ('finished' in msg) {
            finishedRef.current = true;
            ws.close();
            wsRef.current = null;
            setIsConnected(false);
          }
        } catch (err) {
          console.error('Failed to process WebSocket message:', err);
          setError('Failed to process stream update');
        }
      };

      ws.onerror = () => {
        setError('Connection failed');
      };

      ws.onclose = (evt) => {
        setIsConnected(false);
        wsRef.current = null;

        // Do not reconnect if cleanup has already run (component unmounting or effect re-running)
        if (cleanupCalledRef.current) return;

        // Do not reconnect if we received a finished message or clean close
        if (finishedRef.current || (evt?.code === 1000 && evt?.wasClean)) {
          return;
        }

        // Otherwise, reconnect on unexpected/error closures
        retryAttemptsRef.current += 1;
        scheduleReconnect();
      };

      wsRef.current = ws;
    }

    return () => {
      // Mark cleanup as called so in-flight onclose callbacks skip reconnect
      cleanupCalledRef.current = true;

      if (wsRef.current) {
        const ws = wsRef.current;

        // Clear all event handlers first to prevent callbacks after cleanup
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;

        // Close regardless of state
        ws.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      finishedRef.current = false;
      dataRef.current = undefined;
      setData(undefined);
      setIsInitialized(false);
    };
  }, [endpoint, enabled, retryNonce]);

  return { data, isConnected, isInitialized, error };
};
