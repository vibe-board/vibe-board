import { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient } from '../client';
import type { WsConnection } from '../ws';

// ── Types ────────────────────────────────────────────────────────────

interface TerminalInputMsg {
  type: 'input';
  data: string; // base64-encoded
}

interface TerminalResizeMsg {
  type: 'resize';
  cols: number;
  rows: number;
}

type TerminalOutMsg =
  | { type: 'output'; data: string }
  | { type: 'error'; message: string }
  | { type: 'exit' }
  | { type: 'session_info'; session_id: string }
  | { type: 'session_expired' };

type TerminalListener = (msg: TerminalOutMsg) => void;

export interface UseTerminalSocketResult {
  sendInput: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
  onMessage: (listener: TerminalListener) => () => void;
  sessionId: string | undefined;
  isConnected: boolean;
  error: string | null;
}

/**
 * Bidirectional WebSocket hook for interactive terminal sessions.
 *
 * @param workspaceId - workspace to connect to
 * @param cols - initial terminal columns
 * @param rows - initial terminal rows
 * @param enabled - whether to connect
 * @param previousSessionId - optional session ID for reconnection
 */
export function useTerminalSocket(
  workspaceId: string | undefined,
  cols: number,
  rows: number,
  enabled: boolean,
  previousSessionId?: string,
): UseTerminalSocketResult {
  const wsRef = useRef<WsConnection | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenersRef = useRef<Set<TerminalListener>>(new Set());
  const cleanupRef = useRef(false);

  const sendInput = useCallback((data: string) => {
    const msg: TerminalInputMsg = {
      type: 'input',
      data: btoa(data),
    };
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const sendResize = useCallback((newCols: number, newRows: number) => {
    const msg: TerminalResizeMsg = {
      type: 'resize',
      cols: newCols,
      rows: newRows,
    };
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const onMessage = useCallback((listener: TerminalListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!workspaceId || !enabled) return;
    cleanupRef.current = false;

    const params: Record<string, string> = {
      workspace_id: workspaceId,
      cols: String(cols),
      rows: String(rows),
    };
    if (previousSessionId) {
      params['session_id'] = previousSessionId;
    }

    apiClient.connectWs('/terminal/ws', params).then((ws) => {
      if (cleanupRef.current) {
        ws.disconnect();
        return;
      }

      wsRef.current = ws;
      setIsConnected(true);
      setError(null);

      // Send initial resize
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));

      ws.addListener((msg) => {
        if (msg.type !== 'Text') return;
        try {
          const parsed: TerminalOutMsg = JSON.parse(msg.data as string);

          if (parsed.type === 'session_info') {
            setSessionId(parsed.session_id);
          }

          // Notify all listeners
          for (const listener of listenersRef.current) {
            listener(parsed);
          }

          if (parsed.type === 'exit') {
            ws.disconnect();
            wsRef.current = null;
            setIsConnected(false);
          }
        } catch {
          // ignore malformed messages
        }
      });
    }).catch((e) => {
      if (cleanupRef.current) return;
      console.error('Terminal WS connect failed:', e);
      setError('Terminal connection failed');
      setIsConnected(false);
    });

    return () => {
      cleanupRef.current = true;
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [workspaceId, enabled, cols, rows, previousSessionId]);

  return { sendInput, sendResize, onMessage, sessionId, isConnected, error };
}
