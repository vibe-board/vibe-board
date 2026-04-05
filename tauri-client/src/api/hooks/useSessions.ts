import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  Session,
  CreateFollowUpAttempt,
  ResetProcessRequest,
  StartReviewRequest,
  QueueStatus,
  QueuedMessage,
} from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (workspaceId: string) =>
    [...sessionKeys.lists(), { workspaceId }] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
  queue: (id: string) =>
    [...sessionKeys.detail(id), 'queue'] as const,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface CreateSessionRequest {
  workspace_id: string;
  executor?: string | null;
}

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useSessions(
  workspaceId: string,
  options?: Omit<
    UseQueryOptions<Session[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Session[], ApiError>({
    queryKey: sessionKeys.list(workspaceId),
    queryFn: () =>
      apiClient.get<Session[]>('/sessions', {
        workspace_id: workspaceId,
      }),
    enabled: !!workspaceId,
    ...options,
  });
}

export function useSession(
  id: string,
  options?: Omit<
    UseQueryOptions<Session, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Session, ApiError>({
    queryKey: sessionKeys.detail(id),
    queryFn: () => apiClient.get<Session>(`/sessions/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useSessionQueue(
  id: string,
  options?: Omit<
    UseQueryOptions<QueueStatus, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<QueueStatus, ApiError>({
    queryKey: sessionKeys.queue(id),
    queryFn: () =>
      apiClient.get<QueueStatus>(`/sessions/${id}/queue`),
    enabled: !!id,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useCreateSession(
  options?: UseMutationOptions<Session, ApiError, CreateSessionRequest>,
) {
  const queryClient = useQueryClient();

  return useMutation<Session, ApiError, CreateSessionRequest>({
    mutationFn: (body) => apiClient.post<Session>('/sessions', body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.list(variables.workspace_id),
      });
    },
    ...options,
  });
}

export function useFollowUpSession(
  options?: UseMutationOptions<
    Session,
    ApiError,
    { id: string; body: CreateFollowUpAttempt }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    Session,
    ApiError,
    { id: string; body: CreateFollowUpAttempt }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<Session>(`/sessions/${id}/follow-up`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useResetSession(
  options?: UseMutationOptions<
    Session,
    ApiError,
    { id: string; body: ResetProcessRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    Session,
    ApiError,
    { id: string; body: ResetProcessRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<Session>(`/sessions/${id}/reset`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useStartReview(
  options?: UseMutationOptions<
    Session,
    ApiError,
    { id: string; body: StartReviewRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    Session,
    ApiError,
    { id: string; body: StartReviewRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<Session>(`/sessions/${id}/review`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useQueueMessage(
  options?: UseMutationOptions<
    QueuedMessage,
    ApiError,
    { id: string; body: QueuedMessage }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    QueuedMessage,
    ApiError,
    { id: string; body: QueuedMessage }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<QueuedMessage>(`/sessions/${id}/queue`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.queue(id),
      });
    },
    ...options,
  });
}

export function useDeleteQueueMessage(
  options?: UseMutationOptions<void, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiClient.delete<void>(`/sessions/${id}/queue`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.queue(id),
      });
    },
    ...options,
  });
}
