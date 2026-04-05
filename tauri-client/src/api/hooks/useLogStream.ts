import { useEffect, useState, useRef } from 'react';
import { apiClient } from '../client';
import type { WsConnection } from '../ws';

// ── Types ────────────────────────────────────────────────────────────

interface LogEntry {
  type: 'STDOUT' | 'STDERR';
  content: string;
}

interface UseLogStreamResult {
  logs: LogEntry[];
  error: string | null;
}

/**
 * Stream raw (stdout/stderr) logs for an execution process via WebSocket.
 * Accumulates entries and clears on processId change.
 */
export function useLogStream(processId: string): UseLogStreamResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WsConnection | null>(null);
  const processIdRef = useRef(processId);
  const cleanupRef = useRef(false);

  useEffect(() => {
    if (!processId) return;

    processIdRef.current = processId;
    setLogs([]);
    setError(null);
    cleanupRef.current = false;

    const capturedProcessId = processId;

    apiClient.connectWs(`/execution-processes/${processId}/raw-logs/ws`).then((ws) => {
      if (cleanupRef.current || processIdRef.current !== capturedProcessId) {
        ws.disconnect();
        return;
      }

      wsRef.current = ws;

      ws.addListener((msg) => {
        if (msg.type !== 'Text') return;
        if (processIdRef.current !== capturedProcessId) return;

        try {
          const data = JSON.parse(msg.data as string);

          if ('JsonPatch' in data) {
            const patches = data.JsonPatch as Array<{ value?: LogEntry }>;
            for (const patch of patches) {
              const value = patch?.value;
              if (!value || !value.type) continue;
              if (value.type === 'STDOUT' || value.type === 'STDERR') {
                setLogs((prev) => [
                  ...prev,
                  { type: value.type, content: value.content },
                ]);
              }
            }
          }

          if (data.finished === true) {
            ws.disconnect();
            wsRef.current = null;
          }
        } catch {
          // ignore parse errors
        }
      });
    }).catch((e) => {
      if (cleanupRef.current || processIdRef.current !== capturedProcessId) {
        return;
      }
      console.error('Log stream WS failed:', e);
      setError('Log stream connection failed');
    });

    return () => {
      cleanupRef.current = true;
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, [processId]);

  return { logs, error };
}
