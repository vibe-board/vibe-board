import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type {
  Project,
  CreateProject,
  UpdateProject,
  Repo,
} from '@shared/types';
import { apiClient, type ApiError } from '../client';
import { cacheProjects, getCachedProjects } from '@/lib/cache';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: () => [...projectKeys.lists()] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  repos: (id: string) => [...projectKeys.detail(id), 'repos'] as const,
};

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useProjects(
  options?: Omit<
    UseQueryOptions<Project[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  const query = useQuery<Project[], ApiError>({
    queryKey: projectKeys.list(),
    queryFn: () => apiClient.get<Project[]>('/projects'),
    ...options,
  });

  // Sync fetched data to SQLite cache
  const prevDataRef = useRef<Project[] | undefined>();
  useEffect(() => {
    if (query.data && query.data !== prevDataRef.current) {
      prevDataRef.current = query.data;
      cacheProjects(query.data).catch(() => {});
    }
  }, [query.data]);

  return query;
}

// Call this once on app mount to hydrate the query cache from SQLite
export async function hydrateProjectsFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  try {
    const cached = await getCachedProjects();
    if (cached.length > 0) {
      queryClient.setQueryData(projectKeys.list(), cached);
    }
  } catch {
    // Cache not available yet (first run, DB not created)
  }
}

export function useProject(
  id: string,
  options?: Omit<
    UseQueryOptions<Project, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Project, ApiError>({
    queryKey: projectKeys.detail(id),
    queryFn: () => apiClient.get<Project>(`/projects/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useProjectRepos(
  id: string,
  options?: Omit<
    UseQueryOptions<Repo[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Repo[], ApiError>({
    queryKey: projectKeys.repos(id),
    queryFn: () => apiClient.get<Repo[]>(`/projects/${id}/repositories`),
    enabled: !!id,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useCreateProject(
  options?: UseMutationOptions<Project, ApiError, CreateProject>,
) {
  const queryClient = useQueryClient();

  return useMutation<Project, ApiError, CreateProject>({
    mutationFn: (body) => apiClient.post<Project>('/projects', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
    ...options,
  });
}

export function useUpdateProject(
  options?: UseMutationOptions<
    Project,
    ApiError,
    { id: string; body: UpdateProject }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<Project, ApiError, { id: string; body: UpdateProject }>({
    mutationFn: ({ id, body }) =>
      apiClient.put<Project>(`/projects/${id}`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
    ...options,
  });
}

export function useDeleteProject(
  options?: UseMutationOptions<void, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (id) => apiClient.delete<void>(`/projects/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
    ...options,
  });
}
