import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type {
  Task,
  CreateTask,
  UpdateTask,
  ExecutorProfileId,
  WorkspaceMode,
  WorkspaceRepoInput,
} from '@shared/types';
import { apiClient, type ApiError } from '../client';
import { attemptKeys } from './useAttempts';
import { cacheTasks, getCachedTasks } from '@/lib/cache';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (projectId: string) =>
    [...taskKeys.lists(), { projectId }] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  conversationContext: (id: string) =>
    [...taskKeys.detail(id), 'conversation-context'] as const,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface CreateAndStartTaskRequest {
  task: CreateTask;
  executor_profile_id: ExecutorProfileId;
  repos: WorkspaceRepoInput[];
  workspace_mode?: WorkspaceMode;
  initial_context?: string;
}

interface ConversationContextResponse {
  context: string | null;
}

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useTasks(
  projectId: string,
  options?: Omit<
    UseQueryOptions<Task[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  const query = useQuery<Task[], ApiError>({
    queryKey: taskKeys.list(projectId),
    queryFn: () =>
      apiClient.get<Task[]>('/tasks', {
        project_id: projectId,
      }),
    enabled: !!projectId,
    ...options,
  });

  // Sync fetched data to SQLite cache
  const prevDataRef = useRef<Task[] | undefined>();
  useEffect(() => {
    if (query.data && query.data !== prevDataRef.current) {
      prevDataRef.current = query.data;
      cacheTasks(projectId, query.data).catch(() => {});
    }
  }, [query.data, projectId]);

  return query;
}

// Call this once on app mount to hydrate the query cache from SQLite
export async function hydrateTasksFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
): Promise<void> {
  try {
    const cached = await getCachedTasks(projectId);
    if (cached.length > 0) {
      queryClient.setQueryData(taskKeys.list(projectId), cached);
    }
  } catch {
    // Cache not available yet (first run, DB not created)
  }
}

export function useTask(
  id: string,
  options?: Omit<
    UseQueryOptions<Task, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Task, ApiError>({
    queryKey: taskKeys.detail(id),
    queryFn: () => apiClient.get<Task>(`/tasks/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useConversationContext(
  taskId: string,
  options?: Omit<
    UseQueryOptions<ConversationContextResponse, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<ConversationContextResponse, ApiError>({
    queryKey: taskKeys.conversationContext(taskId),
    queryFn: () =>
      apiClient.get<ConversationContextResponse>(
        `/tasks/${taskId}/conversation-context`,
      ),
    enabled: !!taskId,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useCreateTask(
  options?: UseMutationOptions<Task, ApiError, CreateTask>,
) {
  const queryClient = useQueryClient();

  return useMutation<Task, ApiError, CreateTask>({
    mutationFn: (body) => apiClient.post<Task>('/tasks', body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.list(variables.project_id),
      });
    },
    ...options,
  });
}

export function useCreateAndStartTask(
  options?: UseMutationOptions<
    Task,
    ApiError,
    CreateAndStartTaskRequest
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    Task,
    ApiError,
    CreateAndStartTaskRequest
  >({
    mutationFn: (body) =>
      apiClient.post<Task>(
        '/tasks/create-and-start',
        body,
      ),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.list(variables.task.project_id),
      });
      // Also invalidate attempt list so TaskDetail shows the new workspace
      queryClient.invalidateQueries({
        queryKey: attemptKeys.list(data.id),
      });
    },
    ...options,
  });
}

export function useUpdateTask(
  options?: UseMutationOptions<
    Task,
    ApiError,
    { id: string; body: UpdateTask }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<Task, ApiError, { id: string; body: UpdateTask }>({
    mutationFn: ({ id, body }) =>
      apiClient.put<Task>(`/tasks/${id}`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    ...options,
  });
}

export function useDeleteTask(
  options?: UseMutationOptions<void, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (id) => apiClient.delete<void>(`/tasks/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    ...options,
  });
}
