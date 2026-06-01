import { useCallback } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { ExecutionProcess } from 'shared/types';

type ExecutionProcessState = {
  execution_processes: Record<string, ExecutionProcess>;
  diff_signal: Record<string, number>;
};

interface UseExecutionProcessesResult {
  executionProcesses: ExecutionProcess[];
  executionProcessesById: Record<string, ExecutionProcess>;
  isAttemptRunning: boolean;
  diffSignal: Record<string, number>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Stream execution processes for a session via WebSocket (JSON Patch) and expose as array + map.
 * Server sends initial snapshot: replace /execution_processes with an object keyed by id.
 * Live updates arrive at /execution_processes/<id> via add/replace/remove operations.
 *
 * Server may also push /diff_signal/<workspace_id> = <timestamp> updates whenever the
 * workspace's worktree HEAD advances; consumers should watch the corresponding entry
 * to invalidate diff-derived caches.
 */
export const useExecutionProcesses = (
  sessionId: string | undefined,
  opts?: { showSoftDeleted?: boolean }
): UseExecutionProcessesResult => {
  const showSoftDeleted = opts?.showSoftDeleted;
  let endpoint: string | undefined;

  if (sessionId) {
    const params = new URLSearchParams({ session_id: sessionId });
    if (typeof showSoftDeleted === 'boolean') {
      params.set('show_soft_deleted', String(showSoftDeleted));
    }
    endpoint = `/api/execution-processes/stream/session/ws?${params.toString()}`;
  }

  const initialData = useCallback(
    (): ExecutionProcessState => ({ execution_processes: {}, diff_signal: {} }),
    []
  );

  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<ExecutionProcessState>(
      endpoint,
      !!sessionId,
      initialData
    );

  const executionProcessesById = data?.execution_processes ?? {};
  const diffSignal = data?.diff_signal ?? {};
  const executionProcesses = Object.values(executionProcessesById).sort(
    (a, b) =>
      new Date(a.created_at as unknown as string).getTime() -
      new Date(b.created_at as unknown as string).getTime()
  );
  const isAttemptRunning = executionProcesses.some(
    (process) =>
      (process.run_reason === 'codingagent' ||
        process.run_reason === 'setupscript' ||
        process.run_reason === 'cleanupscript' ||
        process.run_reason === 'archivescript' ||
        process.run_reason === 'commitmessage') &&
      process.status === 'running'
  );
  const isLoading = !!sessionId && !isInitialized && !error; // until first snapshot

  return {
    executionProcesses,
    executionProcessesById,
    isAttemptRunning,
    diffSignal,
    isLoading,
    isConnected,
    error,
  };
};
