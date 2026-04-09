import { useInfiniteQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { CommitInfo } from 'shared/types';

const PAGE_SIZE = 50;

export function useCommitHistory(
  attemptId: string | null,
  repoId: string | null
) {
  const query = useInfiniteQuery({
    queryKey: ['commitHistory', attemptId, repoId],
    queryFn: ({ pageParam = 0 }) =>
      attemptsApi.getCommitHistory(attemptId!, repoId!, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.has_more ? lastPageParam + PAGE_SIZE : undefined,
    enabled: !!attemptId && !!repoId,
    staleTime: 30_000,
  });

  const commits: CommitInfo[] =
    query.data?.pages.flatMap((page) => page.commits) ?? [];

  return {
    commits,
    isLoading: query.isLoading,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
