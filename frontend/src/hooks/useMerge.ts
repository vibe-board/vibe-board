import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExecutorProfileId } from 'shared/types';
import { attemptsApi } from '@/lib/api';
import { repoBranchKeys } from './useRepoBranches';
import { taskKeys } from './useTask';

export type MergeParams = {
  repoId: string;
  /** Session for the commit-message agent (same as send/followUp). Required. */
  sessionId: string;
  /** Executor for the commit-message agent (same as send/followUp). Required. */
  executorProfileId: ExecutorProfileId;
  /** Optional override executor profile for commit message generation. */
  commitMessageExecutorProfileId?: ExecutorProfileId | null;
};

export function useMerge(
  attemptId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, MergeParams>({
    mutationFn: (params: MergeParams) => {
      if (!attemptId) return Promise.resolve();
      return attemptsApi.merge(attemptId, {
        repo_id: params.repoId,
        session_id: params.sessionId,
        executor_profile_id: params.executorProfileId,
        commit_message_executor_profile_id:
          params.commitMessageExecutorProfileId ?? null,
      });
    },
    onSuccess: () => {
      // Refresh attempt-specific branch information
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });

      // Invalidate all repo branches queries
      queryClient.invalidateQueries({ queryKey: repoBranchKeys.all });

      // Invalidate task queries so the task status updates to Done
      queryClient.invalidateQueries({ queryKey: taskKeys.all });

      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to merge:', err);
      onError?.(err);
    },
  });
}
