import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  Workspace,
  TaskRelationships,
  CreateTaskAttemptBody,
  Diff,
  CommitHistoryResponse,
  CreateFollowUpAttempt,
  RunAgentSetupRequest,
  RunAgentSetupResponse,
  RebaseTaskAttemptRequest,
  CreatePrApiRequest,
  PrCommentsResponse,
  RenameBranchRequest,
  ChangeTargetBranchRequest,
  MergeTaskAttemptRequest,
  PushTaskAttemptRequest,
  RepoBranchStatus,
  GitBranch,
} from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const attemptKeys = {
  all: ['task-attempts'] as const,
  lists: () => [...attemptKeys.all, 'list'] as const,
  list: (taskId: string) =>
    [...attemptKeys.lists(), { taskId }] as const,
  details: () => [...attemptKeys.all, 'detail'] as const,
  detail: (id: string) => [...attemptKeys.details(), id] as const,
  diff: (id: string, repoId: string) =>
    [...attemptKeys.detail(id), 'diff', repoId] as const,
  commits: (id: string, repoId?: string) =>
    [...attemptKeys.detail(id), 'commits', repoId] as const,
  commitDiff: (id: string, sha: string, repoId: string) =>
    [...attemptKeys.detail(id), 'commit-diff', sha, repoId] as const,
  prComments: (id: string, repoId: string) =>
    [...attemptKeys.detail(id), 'pr-comments', repoId] as const,
  children: (id: string) =>
    [...attemptKeys.detail(id), 'children'] as const,
  branchStatus: (id: string) =>
    [...attemptKeys.detail(id), 'branch-status'] as const,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface MergeResponse {
  success: boolean;
  message: string;
}

interface PushResponse {
  success: boolean;
  message: string;
}

interface PrResponse {
  url: string;
  number: number;
}

interface StopResponse {
  success: boolean;
}

interface RenameBranchResponse {
  branch: string;
}

interface ChangeTargetBranchResponse {
  repo_id: string;
  new_target_branch: string;
  status: [number, number];
}

// ── Query Hooks ────────────────────────────────────────────────────────────

export function useTaskAttempts(
  taskId: string,
  options?: Omit<
    UseQueryOptions<Workspace[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Workspace[], ApiError>({
    queryKey: attemptKeys.list(taskId),
    queryFn: async () => {
      const result = await apiClient.get<Workspace[]>('/task-attempts', { task_id: taskId });
      return result;
    },
    enabled: !!taskId,
    refetchInterval: 5000,
    refetchOnReconnect: true,
    ...options,
  });
}

export function useTaskAttempt(
  id: string,
  options?: Omit<
    UseQueryOptions<Workspace, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Workspace, ApiError>({
    queryKey: attemptKeys.detail(id),
    queryFn: () =>
      apiClient.get<Workspace>(`/task-attempts/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useAttemptDiff(
  id: string,
  repoId: string,
  options?: Omit<
    UseQueryOptions<Diff[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Diff[], ApiError>({
    queryKey: attemptKeys.diff(id, repoId),
    queryFn: () =>
      apiClient.get<Diff[]>(`/task-attempts/${id}/diff`, {
        repo_id: repoId,
      }),
    enabled: !!id && !!repoId,
    ...options,
  });
}

export function useAttemptCommits(
  id: string,
  repoId?: string,
  options?: Omit<
    UseQueryOptions<CommitHistoryResponse, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<CommitHistoryResponse, ApiError>({
    queryKey: attemptKeys.commits(id, repoId),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (repoId) params.repo_id = repoId;
      return apiClient.get<CommitHistoryResponse>(
        `/task-attempts/${id}/commits`,
        params,
      );
    },
    enabled: !!id,
    ...options,
  });
}

export function useCommitDiff(
  attemptId: string,
  sha: string,
  repoId: string,
  options?: Omit<
    UseQueryOptions<Diff[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<Diff[], ApiError>({
    queryKey: attemptKeys.commitDiff(attemptId, sha, repoId),
    queryFn: () =>
      apiClient.get<Diff[]>(
        `/task-attempts/${attemptId}/commits/${sha}/diff`,
        { repo_id: repoId },
      ),
    enabled: !!attemptId && !!sha && !!repoId,
    ...options,
  });
}

export function usePrComments(
  id: string,
  repoId: string,
  options?: Omit<
    UseQueryOptions<PrCommentsResponse, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<PrCommentsResponse, ApiError>({
    queryKey: attemptKeys.prComments(id, repoId),
    queryFn: () =>
      apiClient.get<PrCommentsResponse>(
        `/task-attempts/${id}/pr/comments`,
        { repo_id: repoId },
      ),
    enabled: !!id && !!repoId,
    ...options,
  });
}

export function useTaskRelationships(
  attemptId: string,
  options?: Omit<
    UseQueryOptions<TaskRelationships, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<TaskRelationships, ApiError>({
    queryKey: attemptKeys.children(attemptId),
    queryFn: () =>
      apiClient.get<TaskRelationships>(
        `/task-attempts/${attemptId}/children`,
      ),
    enabled: !!attemptId,
    ...options,
  });
}

export function useBranchStatus(
  attemptId: string,
  options?: Omit<
    UseQueryOptions<RepoBranchStatus[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<RepoBranchStatus[], ApiError>({
    queryKey: attemptKeys.branchStatus(attemptId),
    queryFn: () =>
      apiClient.get<RepoBranchStatus[]>(
        `/task-attempts/${attemptId}/branch-status`,
      ),
    enabled: !!attemptId,
    ...options,
  });
}

export function useRepoBranches(
  repoId: string,
  options?: Omit<
    UseQueryOptions<GitBranch[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<GitBranch[], ApiError>({
    queryKey: ['repo-branches', repoId],
    queryFn: () =>
      apiClient.get<GitBranch[]>(`/repos/${repoId}/branches`),
    enabled: !!repoId,
    ...options,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useCreateTaskAttempt(
  options?: UseMutationOptions<Workspace, ApiError, CreateTaskAttemptBody>,
) {
  const queryClient = useQueryClient();

  return useMutation<Workspace, ApiError, CreateTaskAttemptBody>({
    mutationFn: (body) =>
      apiClient.post<Workspace>('/task-attempts', body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.list(variables.task_id),
      });
    },
    ...options,
  });
}

export function useRunAgentSetup(
  options?: UseMutationOptions<
    RunAgentSetupResponse,
    ApiError,
    { id: string; body: RunAgentSetupRequest }
  >,
) {
  return useMutation<
    RunAgentSetupResponse,
    ApiError,
    { id: string; body: RunAgentSetupRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<RunAgentSetupResponse>(
        `/task-attempts/${id}/run-agent-setup`,
        body,
      ),
    ...options,
  });
}

export function useFollowUp(
  options?: UseMutationOptions<
    Workspace,
    ApiError,
    { id: string; body: CreateFollowUpAttempt }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    Workspace,
    ApiError,
    { id: string; body: CreateFollowUpAttempt }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<Workspace>(`/task-attempts/${id}`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useMergeAttempt(
  options?: UseMutationOptions<
    MergeResponse,
    ApiError,
    { id: string; body: MergeTaskAttemptRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    MergeResponse,
    ApiError,
    { id: string; body: MergeTaskAttemptRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<MergeResponse>(`/task-attempts/${id}/merge`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
      queryClient.invalidateQueries({
        queryKey: attemptKeys.branchStatus(id),
      });
    },
    ...options,
  });
}

export function usePushAttempt(
  options?: UseMutationOptions<
    PushResponse,
    ApiError,
    { id: string; body: PushTaskAttemptRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    PushResponse,
    ApiError,
    { id: string; body: PushTaskAttemptRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<PushResponse>(`/task-attempts/${id}/push`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
      queryClient.invalidateQueries({
        queryKey: attemptKeys.branchStatus(id),
      });
    },
    ...options,
  });
}

export function useRebaseAttempt(
  options?: UseMutationOptions<
    void,
    ApiError,
    { id: string; body: RebaseTaskAttemptRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { id: string; body: RebaseTaskAttemptRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<void>(`/task-attempts/${id}/rebase`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useCreatePr(
  options?: UseMutationOptions<
    PrResponse,
    ApiError,
    { id: string; body: CreatePrApiRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    PrResponse,
    ApiError,
    { id: string; body: CreatePrApiRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<PrResponse>(`/task-attempts/${id}/pr`, body),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useStopAttempt(
  options?: UseMutationOptions<StopResponse, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<StopResponse, ApiError, string>({
    mutationFn: (id) =>
      apiClient.post<StopResponse>(`/task-attempts/${id}/stop`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useRenameBranch(
  options?: UseMutationOptions<
    RenameBranchResponse,
    ApiError,
    { id: string; body: RenameBranchRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    RenameBranchResponse,
    ApiError,
    { id: string; body: RenameBranchRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<RenameBranchResponse>(
        `/task-attempts/${id}/rename-branch`,
        body,
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useChangeTargetBranch(
  options?: UseMutationOptions<
    ChangeTargetBranchResponse,
    ApiError,
    { id: string; body: ChangeTargetBranchRequest }
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<
    ChangeTargetBranchResponse,
    ApiError,
    { id: string; body: ChangeTargetBranchRequest }
  >({
    mutationFn: ({ id, body }) =>
      apiClient.post<ChangeTargetBranchResponse>(
        `/task-attempts/${id}/change-target-branch`,
        body,
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: attemptKeys.detail(id),
      });
    },
    ...options,
  });
}

export function useDeleteTaskAttempt(
  options?: UseMutationOptions<void, ApiError, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiClient.delete<void>(`/task-attempts/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: attemptKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: attemptKeys.lists() });
    },
    ...options,
  });
}
