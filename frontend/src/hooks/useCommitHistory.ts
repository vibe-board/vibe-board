import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useCommitHistory(
  attemptId: string | null,
  repoId: string | null,
  limit: number = 50
) {
  return useQuery({
    queryKey: ['commitHistory', attemptId, repoId, limit],
    queryFn: () => attemptsApi.getCommitHistory(attemptId!, repoId!, limit),
    enabled: !!attemptId && !!repoId,
    staleTime: 30_000,
  });
}
