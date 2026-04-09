import { useQuery } from '@tanstack/react-query';
import { systemApi } from '@/lib/api';

export function useHomeDir() {
  return useQuery({
    queryKey: ['system', 'homeDir'],
    queryFn: () => systemApi.getHomeDir(),
    staleTime: Infinity,
  });
}
