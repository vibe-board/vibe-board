import { useMemo } from 'react';
import type { ExecutionProcess } from '@shared/types';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';

interface AttemptStreamState {
  execution_processes: Record<string, ExecutionProcess>;
}

export function useAttemptStream(sessionId: string | undefined) {
  const endpoint = sessionId
    ? `/execution-processes/stream/session/ws?session_id=${sessionId}`
    : undefined;

  const { data, isInitialized, isConnected, error } =
    useJsonPatchWsStream<AttemptStreamState>(
      endpoint,
      !!sessionId,
      () => ({ execution_processes: {} }),
    );

  const executionProcesses = useMemo(
    () => data?.execution_processes,
    [data],
  );

  return { executionProcesses, isInitialized, isConnected, error };
}
