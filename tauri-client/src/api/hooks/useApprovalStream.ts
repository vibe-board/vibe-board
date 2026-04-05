import { useMemo, useCallback } from 'react';
import type { ApprovalInfo } from '@shared/types';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';

interface ApprovalStreamState {
  pending: Record<string, ApprovalInfo>;
}

export function useApprovalStream() {
  const { data, isInitialized, isConnected, error } =
    useJsonPatchWsStream<ApprovalStreamState>(
      '/approvals/stream/ws',
      true,
      () => ({ pending: {} }),
    );

  const pendingById = useMemo(() => data?.pending ?? {}, [data?.pending]);

  const pendingApprovals = useMemo(
    () => Object.values(pendingById),
    [pendingById],
  );

  const getPendingForProcess = useCallback(
    (executionProcessId: string): ApprovalInfo | null => {
      for (const info of pendingApprovals) {
        if (info.execution_process_id === executionProcessId) {
          return info;
        }
      }
      return null;
    },
    [pendingApprovals],
  );

  const getPendingById = useCallback(
    (approvalId: string): ApprovalInfo | null => {
      return pendingById[approvalId] ?? null;
    },
    [pendingById],
  );

  return {
    pendingApprovals,
    pendingById,
    getPendingForProcess,
    getPendingById,
    isInitialized,
    isConnected,
    error,
  };
}
