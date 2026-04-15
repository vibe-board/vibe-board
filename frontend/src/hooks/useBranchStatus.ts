import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

export function useBranchStatus(attemptId?: string) {
  const { attemptsApi } = useApi();
  return useQuery({
    queryKey: ['branchStatus', attemptId],
    queryFn: () => attemptsApi.getBranchStatus(attemptId!),
    enabled: !!attemptId,
    refetchInterval: 5000,
  });
}
