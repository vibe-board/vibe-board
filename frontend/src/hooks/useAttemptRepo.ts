import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import type { RepoWithTargetBranch } from 'shared/types';

interface UseAttemptRepoOptions {
  enabled?: boolean;
}

export function useAttemptRepo(
  attemptId?: string,
  options: UseAttemptRepoOptions = {}
) {
  const { attemptsApi } = useApi();
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  const query = useQuery<RepoWithTargetBranch[]>({
    queryKey: ['attemptRepo', attemptId],
    queryFn: async () => {
      const repos = await attemptsApi.getRepos(attemptId!);
      return repos;
    },
    enabled: enabled && !!attemptId,
  });

  const repos = useMemo(() => query.data ?? [], [query.data]);

  // Use React Query cache for shared state across all hook consumers
  const { data: selectedRepoId = null } = useQuery<string | null>({
    queryKey: ['attemptRepoSelection', attemptId],
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  });

  const setSelectedRepoId = useCallback(
    (id: string | null) => {
      queryClient.setQueryData(['attemptRepoSelection', attemptId], id);
    },
    [queryClient, attemptId]
  );

  // Auto-select the default repo when none selected. The default repo is the
  // first non-nested (top-level) repo; nested submodules must not shadow it.
  useEffect(() => {
    if (repos.length > 0 && selectedRepoId === null) {
      const defaultRepo = repos.find((r) => !r.is_nested) ?? repos[0];
      setSelectedRepoId(defaultRepo.id);
    }
  }, [repos, selectedRepoId, setSelectedRepoId]);

  return {
    repos,
    selectedRepoId,
    setSelectedRepoId,
    isLoading: query.isLoading,
    refetch: query.refetch,
  } as const;
}
