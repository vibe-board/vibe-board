import { useQuery } from '@tanstack/react-query';
import type { Diff } from 'shared/types';
import { attemptsApi } from '@/lib/api';

export interface UseDiffStreamOptions {
  repoId?: string | null;
}

interface UseDiffStreamResult {
  diffs: Diff[];
  error: string | null;
  isInitialized: boolean;
}

export const useDiffStream = (
  attemptId: string | null,
  enabled: boolean,
  options?: UseDiffStreamOptions
): UseDiffStreamResult => {
  const repoId = options?.repoId;

  const {
    data: diffs,
    error,
    isSuccess,
  } = useQuery({
    queryKey: ['workspaceDiff', attemptId, repoId],
    queryFn: () => attemptsApi.getWorkspaceDiffs(attemptId!, repoId ?? ''),
    enabled: enabled && !!attemptId && !!repoId,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const errorString = error ? String(error) : null;

  return {
    diffs: diffs ?? [],
    error: errorString,
    isInitialized: isSuccess || errorString !== null,
  };
};
