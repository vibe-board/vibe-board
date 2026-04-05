import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type { Tag, CreateTag, UpdateTag } from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: (search?: string) =>
    [...tagKeys.lists(), { search }] as const,
};

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useTags(
  search?: string,
  options?: Omit<
    UseQueryOptions<Tag[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Tag[], ApiError>({
    queryKey: tagKeys.list(search),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      return apiClient.get<Tag[]>('/tags', params);
    },
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useCreateTag(
  options?: UseMutationOptions<Tag, ApiError, CreateTag>,
) {
  const queryClient = useQueryClient();

  return useMutation<Tag, ApiError, CreateTag>({
    mutationFn: (body) => apiClient.post<Tag>('/tags', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
    ...options,
  });
}

export function useUpdateTag(
  options?: UseMutationOptions<
    Tag,
    ApiError,
    { id: string; body: UpdateTag }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<Tag, ApiError, { id: string; body: UpdateTag }>({
    mutationFn: ({ id, body }) =>
      apiClient.put<Tag>(`/tags/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
    ...options,
  });
}

export function useDeleteTag(
  options?: UseMutationOptions<void, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (id) => apiClient.delete<void>(`/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
    ...options,
  });
}
