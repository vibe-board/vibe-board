import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type { Image, ImageResponse, ImageMetadata } from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const imageKeys = {
  all: ['images'] as const,
  byTask: (taskId: string) =>
    [...imageKeys.all, 'task', taskId] as const,
  metadata: (taskId: string, path: string) =>
    [...imageKeys.all, 'metadata', taskId, path] as const,
};

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useTaskImages(
  taskId: string,
  options?: Omit<
    UseQueryOptions<Image[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Image[], ApiError>({
    queryKey: imageKeys.byTask(taskId),
    queryFn: () =>
      apiClient.get<Image[]>(`/images/task/${taskId}`),
    enabled: !!taskId,
    ...options,
  });
}

export function useImageMetadata(
  taskId: string,
  path: string,
  options?: Omit<
    UseQueryOptions<ImageMetadata, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<ImageMetadata, ApiError>({
    queryKey: imageKeys.metadata(taskId, path),
    queryFn: () =>
      apiClient.get<ImageMetadata>(
        `/images/task/${taskId}/metadata`,
        { path },
      ),
    enabled: !!taskId && !!path,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useUploadImage(
  options?: UseMutationOptions<ImageResponse, ApiError, FormData>,
) {
  const queryClient = useQueryClient();

  return useMutation<ImageResponse, ApiError, FormData>({
    mutationFn: (formData) =>
      apiClient.postForm<ImageResponse>('/images/upload', formData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageKeys.all,
      });
    },
    ...options,
  });
}

export function useDeleteImage(
  options?: UseMutationOptions<void, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (id) => apiClient.delete<void>(`/images/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageKeys.all,
      });
    },
    ...options,
  });
}
