import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

export function useHomeDir() {
  const { systemApi } = useApi();
  return useQuery({
    queryKey: ['system', 'homeDir'],
    queryFn: () => systemApi.getHomeDir(),
    staleTime: Infinity,
  });
}
