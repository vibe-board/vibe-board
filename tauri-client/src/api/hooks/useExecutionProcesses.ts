import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  ExecutionProcess,
  ExecutionProcessRepoState,
} from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const executionProcessKeys = {
  all: ['execution-processes'] as const,
  details: () => [...executionProcessKeys.all, 'detail'] as const,
  detail: (id: string) =>
    [...executionProcessKeys.details(), id] as const,
  repoStates: (id: string) =>
    [...executionProcessKeys.detail(id), 'repo-states'] as const,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface StopResponse {
  success: boolean;
}

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useExecutionProcess(
  id: string,
  options?: Omit<
    UseQueryOptions<ExecutionProcess, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<ExecutionProcess, ApiError>({
    queryKey: executionProcessKeys.detail(id),
    queryFn: () =>
      apiClient.get<ExecutionProcess>(`/execution-processes/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useRepoStates(
  id: string,
  options?: Omit<
    UseQueryOptions<ExecutionProcessRepoState[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<ExecutionProcessRepoState[], ApiError>({
    queryKey: executionProcessKeys.repoStates(id),
    queryFn: () =>
      apiClient.get<ExecutionProcessRepoState[]>(
        `/execution-processes/${id}/repo-states`,
      ),
    enabled: !!id,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useStopExecutionProcess(
  options?: UseMutationOptions<StopResponse, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<StopResponse, ApiError, string>({
    mutationFn: (id) =>
      apiClient.post<StopResponse>(
        `/execution-processes/${id}/stop`,
      ),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: executionProcessKeys.detail(id),
      });
    },
    ...options,
  });
}
