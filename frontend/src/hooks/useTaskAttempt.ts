import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { WorkspaceWithSession } from '@/types/attempt';

export function useTaskAttempt(attemptId?: string) {
  const { attemptsApi } = useApi();
  return useQuery({
    queryKey: ['taskAttempt', attemptId],
    queryFn: () => attemptsApi.get(attemptId!),
    enabled: !!attemptId,
  });
}

/**
 * Hook for components that need executor field (e.g., for capability checks).
 * Fetches workspace with executor from latest session.
 */
export function useTaskAttemptWithSession(attemptId?: string) {
  const { attemptsApi } = useApi();
  return useQuery<WorkspaceWithSession>({
    queryKey: ['taskAttemptWithSession', attemptId],
    queryFn: () => attemptsApi.getWithSession(attemptId!),
    enabled: !!attemptId,
  });
}
