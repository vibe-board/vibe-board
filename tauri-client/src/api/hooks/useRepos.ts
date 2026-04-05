import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type { Repo, UpdateRepo } from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const repoKeys = {
  all: ['repos'] as const,
  lists: () => [...repoKeys.all, 'list'] as const,
  list: () => [...repoKeys.lists()] as const,
  details: () => [...repoKeys.all, 'detail'] as const,
  detail: (id: string) => [...repoKeys.details(), id] as const,
  branches: (id: string) =>
    [...repoKeys.detail(id), 'branches'] as const,
  remotes: (id: string) =>
    [...repoKeys.detail(id), 'remotes'] as const,
  prs: (id: string) => [...repoKeys.detail(id), 'prs'] as const,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface RegisterRepoRequest {
  path: string;
  name?: string;
}

interface BranchInfo {
  name: string;
  is_default: boolean;
}

interface RemoteInfo {
  name: string;
  url: string;
}

interface PrInfo {
  number: number;
  title: string;
  url: string;
  state: string;
  branch: string;
}

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useRepos(
  options?: Omit<
    UseQueryOptions<Repo[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Repo[], ApiError>({
    queryKey: repoKeys.list(),
    queryFn: () => apiClient.get<Repo[]>('/repos'),
    ...options,
  });
}

export function useRepo(
  id: string,
  options?: Omit<
    UseQueryOptions<Repo, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Repo, ApiError>({
    queryKey: repoKeys.detail(id),
    queryFn: () => apiClient.get<Repo>(`/repos/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useRepoBranches(
  id: string,
  options?: Omit<
    UseQueryOptions<BranchInfo[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<BranchInfo[], ApiError>({
    queryKey: repoKeys.branches(id),
    queryFn: () =>
      apiClient.get<BranchInfo[]>(`/repos/${id}/branches`),
    enabled: !!id,
    ...options,
  });
}

export function useRepoRemotes(
  id: string,
  options?: Omit<
    UseQueryOptions<RemoteInfo[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<RemoteInfo[], ApiError>({
    queryKey: repoKeys.remotes(id),
    queryFn: () =>
      apiClient.get<RemoteInfo[]>(`/repos/${id}/remotes`),
    enabled: !!id,
    ...options,
  });
}

export function useRepoPrs(
  id: string,
  options?: Omit<
    UseQueryOptions<PrInfo[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<PrInfo[], ApiError>({
    queryKey: repoKeys.prs(id),
    queryFn: () => apiClient.get<PrInfo[]>(`/repos/${id}/prs`),
    enabled: !!id,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useRegisterRepo(
  options?: UseMutationOptions<Repo, ApiError, RegisterRepoRequest>,
) {
  const queryClient = useQueryClient();

  return useMutation<Repo, ApiError, RegisterRepoRequest>({
    mutationFn: (body) => apiClient.post<Repo>('/repos', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() });
    },
    ...options,
  });
}

export function useUpdateRepo(
  options?: UseMutationOptions<
    Repo,
    ApiError,
    { id: string; body: UpdateRepo }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<Repo, ApiError, { id: string; body: UpdateRepo }>({
    mutationFn: ({ id, body }) =>
      apiClient.put<Repo>(`/repos/${id}`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: repoKeys.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() });
    },
    ...options,
  });
}
