import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  Config,
  UserSystemInfo,
  GetMcpServerResponse,
  UpdateMcpServersBody,
  ExecutorConfigs,
} from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const configKeys = {
  all: ['config'] as const,
  info: () => [...configKeys.all, 'info'] as const,
  profiles: () => [...configKeys.all, 'profiles'] as const,
  mcpConfig: (executor: string) =>
    [...configKeys.all, 'mcp', executor] as const,
};

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useSystemInfo(
  options?: Omit<
    UseQueryOptions<UserSystemInfo, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<UserSystemInfo, ApiError>({
    queryKey: configKeys.info(),
    queryFn: () => apiClient.get<UserSystemInfo>('/info'),
    ...options,
  });
}

export function useProfiles(
  options?: Omit<
    UseQueryOptions<ExecutorConfigs, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<ExecutorConfigs, ApiError>({
    queryKey: configKeys.profiles(),
    queryFn: () => apiClient.get<ExecutorConfigs>('/profiles'),
    ...options,
  });
}

export function useMcpConfig(
  executor: string,
  options?: Omit<
    UseQueryOptions<GetMcpServerResponse, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<GetMcpServerResponse, ApiError>({
    queryKey: configKeys.mcpConfig(executor),
    queryFn: () =>
      apiClient.get<GetMcpServerResponse>('/mcp-config', {
        executor,
      }),
    enabled: !!executor,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useUpdateConfig(
  options?: UseMutationOptions<Config, ApiError, Config>,
) {
  const queryClient = useQueryClient();

  return useMutation<Config, ApiError, Config>({
    mutationFn: (body) => apiClient.put<Config>('/config', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configKeys.info() });
    },
    ...options,
  });
}

export function useUpdateProfiles(
  options?: UseMutationOptions<ExecutorConfigs, ApiError, ExecutorConfigs>,
) {
  const queryClient = useQueryClient();

  return useMutation<ExecutorConfigs, ApiError, ExecutorConfigs>({
    mutationFn: (body) =>
      apiClient.put<ExecutorConfigs>('/profiles', body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: configKeys.profiles(),
      });
    },
    ...options,
  });
}

export function useUpdateMcpConfig(
  options?: UseMutationOptions<
    GetMcpServerResponse,
    ApiError,
    { executor: string; body: UpdateMcpServersBody }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    GetMcpServerResponse,
    ApiError,
    { executor: string; body: UpdateMcpServersBody }
  >({
    mutationFn: ({ executor, body }) =>
      apiClient.post<GetMcpServerResponse>(
        `/mcp-config?executor=${executor}`,
        body,
      ),
    onSuccess: (_data, { executor }) => {
      queryClient.invalidateQueries({
        queryKey: configKeys.mcpConfig(executor),
      });
    },
    ...options,
  });
}
