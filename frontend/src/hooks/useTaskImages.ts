import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { ImageResponse } from 'shared/types';

export function useTaskImages(taskId?: string) {
  const { imagesApi } = useApi();
  return useQuery<ImageResponse[]>({
    queryKey: ['taskImages', taskId],
    queryFn: () => imagesApi.getTaskImages(taskId!),
    enabled: !!taskId,
  });
}
