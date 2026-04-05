import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { RepoWithTargetBranch } from '@shared/types';
import { apiClient, type ApiError } from '../client';

const attemptRepoKeys = {
  all: ['attempt-repos'] as const,
  list: (attemptId: string) =>
    [...attemptRepoKeys.all, attemptId] as const,
};

export function useAttemptRepos(
  attemptId: string,
  options?: Omit<
    UseQueryOptions<RepoWithTargetBranch[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<RepoWithTargetBranch[], ApiError>({
    queryKey: attemptRepoKeys.list(attemptId),
    queryFn: () =>
      apiClient.get<RepoWithTargetBranch[]>(
        `/task-attempts/${attemptId}/repos`,
      ),
    enabled: !!attemptId,
    ...options,
  });
}
