import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

export function useAttemptConflicts(attemptId?: string, repoId?: string) {
  const { attemptsApi } = useApi();
  const queryClient = useQueryClient();

  const abortConflicts = useCallback(async () => {
    if (!attemptId || !repoId) return;
    await attemptsApi.abortConflicts(attemptId, { repo_id: repoId });
    await queryClient.invalidateQueries({
      queryKey: ['branchStatus', attemptId],
    });
  }, [attemptId, repoId, queryClient]);

  return { abortConflicts } as const;
}
