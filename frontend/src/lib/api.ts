// Import all necessary types from shared types

import {
  ApprovalStatus,
  ApiResponse,
  Config,
  CreateFollowUpAttempt,
  ResetProcessRequest,
  EditorType,
  CreatePrApiRequest,
  CreateTask,
  CreateAndStartTaskRequest,
  CreateTaskAttemptBody,
  CreateTag,
  DirectoryListResponse,
  DirectoryEntry,
  ExecutionProcess,
  ExecutionProcessRepoState,
  GitBranch,
  Project,
  Repo,
  RepoWithTargetBranch,
  CreateProject,
  CreateProjectRepo,
  UpdateRepo,
  SearchMode,
  SearchResult,
  Task,
  TaskRelationships,
  Tag,
  TagSearchParams,
  UpdateProject,
  UpdateTask,
  UpdateTag,
  UserSystemInfo,
  McpServerQuery,
  UpdateMcpServersBody,
  GetMcpServerResponse,
  ImageResponse,
  GitOperationError,
  ApprovalResponse,
  RebaseTaskAttemptRequest,
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
  RenameBranchRequest,
  RenameBranchResponse,
  CheckEditorAvailabilityResponse,
  AvailabilityInfo,
  BaseCodingAgent,
  ConversationContextResponse,
  ExecutorProfileId,
  RunAgentSetupRequest,
  RunAgentSetupResponse,
  GhCliSetupError,
  RunScriptError,
  StatusResponse,
  OpenEditorResponse,
  OpenEditorRequest,
  PrError,
  Scratch,
  ScratchType,
  CreateScratch,
  UpdateScratch,
  PushError,
  QueueStatus,
  PrCommentsResponse,
  MergeTaskAttemptRequest,
  PushTaskAttemptRequest,
  RepoBranchStatus,
  AbortConflictsRequest,
  ContinueRebaseRequest,
  Session,
  Workspace,
  StartReviewRequest,
  ReviewError,
  OpenPrInfo,
  GitRemote,
  ListPrsError,
  CreateWorkspaceFromPrBody,
  CreateWorkspaceFromPrResponse,
  CreateFromPrError,
  Diff,
  PaginatedTaskHistory,
  CommitHistoryResponse,
} from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { createWorkspaceWithSession } from '@/types/attempt';
// Paginated normalized entries types
export type NormalizedEntryRecord = {
  execution_id: string;
  entry_index: number;
  entry_json: string;
  inserted_at: string;
};

export type PaginatedNormalizedEntries = {
  entries: NormalizedEntryRecord[];
  total_count: number;
  has_more: boolean;
};

export class ApiError<E = unknown> extends Error {
  public status?: number;
  public error_data?: E;

  constructor(
    message: string,
    public statusCode?: number,
    public response?: Response,
    error_data?: E
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = statusCode;
    this.error_data = error_data;
  }
}

export type Ok<T> = { success: true; data: T };
export type Err<E> = { success: false; error: E | undefined; message?: string };

// Result type for endpoints that need typed errors
export type Result<T, E> = Ok<T> | Err<E>;

export type MakeRequestFn = (
  url: string,
  options?: RequestInit,
  extra?: { timeoutMs?: number }
) => Promise<Response>;

export type UploadFormDataFn = (
  url: string,
  formData: FormData
) => Promise<Response>;

// Special handler for Result-returning endpoints
const handleApiResponseAsResult = async <T, E>(
  response: Response
): Promise<Result<T, E>> => {
  if (!response.ok) {
    // HTTP error - no structured error data
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }

    return {
      success: false,
      error: undefined,
      message: errorMessage,
    };
  }

  const result: ApiResponse<T, E> = await response.json();

  if (!result.success) {
    return {
      success: false,
      error: result.error_data || undefined,
      message: result.message || undefined,
    };
  }

  return { success: true, data: result.data as T };
};

const handleApiResponse = async <T, E = T>(
  response: Response
): Promise<T> => {
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Fallback to status text if JSON parsing fails
      errorMessage = response.statusText || errorMessage;
    }

    console.error('[API Error]', {
      message: errorMessage,
      status: response.status,
      response,
      endpoint: response.url,
      timestamp: new Date().toISOString(),
    });
    throw new ApiError<E>(errorMessage, response.status, response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const result: ApiResponse<T, E> = await response.json();

  if (!result.success) {
    // Check for error_data first (structured errors), then fall back to message
    if (result.error_data) {
      console.error('[API Error with data]', {
        error_data: result.error_data,
        message: result.message,
        status: response.status,
        response,
        endpoint: response.url,
        timestamp: new Date().toISOString(),
      });
      // Throw a properly typed error with the error data
      throw new ApiError<E>(
        result.message || 'API request failed',
        response.status,
        response,
        result.error_data
      );
    }

    console.error('[API Error]', {
      message: result.message || 'API request failed',
      status: response.status,
      response,
      endpoint: response.url,
      timestamp: new Date().toISOString(),
    });
    throw new ApiError<E>(
      result.message || 'API request failed',
      response.status,
      response
    );
  }

  return result.data as T;
};

// Config Transfer APIs
export interface ConfigExportEnvelope {
  export_version: number;
  exported_at: string;
  source_app_version: string;
  sections: Record<string, unknown>;
}

export interface ConfigImportResult {
  results: Record<string, { status: string; message?: string }>;
}

/**
 * Factory that creates all API namespace objects using injected fetch helpers.
 * Used by per-connection API instances so each tab talks to its own backend.
 */
export function createApi(makeReq: MakeRequestFn, uploadFd: UploadFormDataFn) {
  const _attemptsApi = {
    getChildren: async (attemptId: string): Promise<TaskRelationships> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/children`
      );
      return handleApiResponse<TaskRelationships>(response);
    },

    getAll: async (taskId: string): Promise<Workspace[]> => {
      const response = await makeReq(`/api/task-attempts?task_id=${taskId}`);
      return handleApiResponse<Workspace[]>(response);
    },

    /** Get all workspaces across all tasks (newest first) */
    getAllWorkspaces: async (): Promise<Workspace[]> => {
      const response = await makeReq('/api/task-attempts');
      return handleApiResponse<Workspace[]>(response);
    },

    /** Get total count of workspaces */
    getCount: async (): Promise<number> => {
      const response = await makeReq('/api/task-attempts/count');
      return handleApiResponse<number>(response);
    },

    get: async (attemptId: string): Promise<Workspace> => {
      const response = await makeReq(`/api/task-attempts/${attemptId}`);
      return handleApiResponse<Workspace>(response);
    },

    update: async (
      attemptId: string,
      data: { archived?: boolean; pinned?: boolean; name?: string }
    ): Promise<Workspace> => {
      const response = await makeReq(`/api/task-attempts/${attemptId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return handleApiResponse<Workspace>(response);
    },

    /** Get workspace with latest session */
    getWithSession: async (
      attemptId: string
    ): Promise<WorkspaceWithSession> => {
      const [workspace, sessions] = await Promise.all([
        _attemptsApi.get(attemptId),
        _sessionsApi.getByWorkspace(attemptId),
      ]);
      return createWorkspaceWithSession(workspace, sessions[0]);
    },

    create: async (data: CreateTaskAttemptBody): Promise<Workspace> => {
      const response = await makeReq(`/api/task-attempts`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponse<Workspace>(response);
    },

    stop: async (attemptId: string): Promise<void> => {
      const response = await makeReq(`/api/task-attempts/${attemptId}/stop`, {
        method: 'POST',
      });
      return handleApiResponse<void>(response);
    },

    delete: async (
      attemptId: string,
      deleteBranches?: boolean
    ): Promise<void> => {
      const params = new URLSearchParams();
      if (deleteBranches) {
        params.set('delete_branches', 'true');
      }
      const queryString = params.toString();
      const url = `/api/task-attempts/${attemptId}${queryString ? `?${queryString}` : ''}`;
      const response = await makeReq(url, {
        method: 'DELETE',
      });
      return handleApiResponse<void>(response);
    },

    linkToIssue: async (
      workspaceId: string,
      projectId: string,
      issueId: string
    ): Promise<void> => {
      const response = await makeReq(`/api/task-attempts/${workspaceId}/link`, {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId, issue_id: issueId }),
      });
      return handleApiResponse<void>(response);
    },

    unlinkFromIssue: async (workspaceId: string): Promise<void> => {
      const response = await makeReq(
        `/api/task-attempts/${workspaceId}/unlink`,
        { method: 'POST' }
      );
      return handleApiResponse<void>(response);
    },

    runAgentSetup: async (
      attemptId: string,
      data: RunAgentSetupRequest
    ): Promise<RunAgentSetupResponse> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/run-agent-setup`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return handleApiResponse<RunAgentSetupResponse>(response);
    },

    openEditor: async (
      attemptId: string,
      data: OpenEditorRequest
    ): Promise<OpenEditorResponse> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/open-editor`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return handleApiResponse<OpenEditorResponse>(response);
    },

    getBranchStatus: async (attemptId: string): Promise<RepoBranchStatus[]> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/branch-status`
      );
      return handleApiResponse<RepoBranchStatus[]>(response);
    },

    getRepos: async (attemptId: string): Promise<RepoWithTargetBranch[]> => {
      const response = await makeReq(`/api/task-attempts/${attemptId}/repos`);
      return handleApiResponse<RepoWithTargetBranch[]>(response);
    },

    getFirstUserMessage: async (attemptId: string): Promise<string | null> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/first-message`
      );
      return handleApiResponse<string | null>(response);
    },

    merge: async (
      attemptId: string,
      data: MergeTaskAttemptRequest
    ): Promise<void> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/merge`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        { timeoutMs: 120_000 }
      );
      return handleApiResponse<void>(response);
    },

    push: async (
      attemptId: string,
      data: PushTaskAttemptRequest
    ): Promise<Result<void, PushError>> => {
      const response = await makeReq(`/api/task-attempts/${attemptId}/push`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponseAsResult<void, PushError>(response);
    },

    forcePush: async (
      attemptId: string,
      data: PushTaskAttemptRequest
    ): Promise<Result<void, PushError>> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/push/force`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return handleApiResponseAsResult<void, PushError>(response);
    },

    rebase: async (
      attemptId: string,
      data: RebaseTaskAttemptRequest
    ): Promise<Result<void, GitOperationError>> => {
      const response = await makeReq(`/api/task-attempts/${attemptId}/rebase`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponseAsResult<void, GitOperationError>(response);
    },

    change_target_branch: async (
      attemptId: string,
      data: ChangeTargetBranchRequest
    ): Promise<ChangeTargetBranchResponse> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/change-target-branch`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return handleApiResponse<ChangeTargetBranchResponse>(response);
    },

    renameBranch: async (
      attemptId: string,
      newBranchName: string
    ): Promise<RenameBranchResponse> => {
      const payload: RenameBranchRequest = {
        new_branch_name: newBranchName,
      };
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/rename-branch`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      return handleApiResponse<RenameBranchResponse>(response);
    },

    abortConflicts: async (
      attemptId: string,
      data: AbortConflictsRequest
    ): Promise<void> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/conflicts/abort`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return handleApiResponse<void>(response);
    },

    continueRebase: async (
      attemptId: string,
      data: ContinueRebaseRequest
    ): Promise<void> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/rebase/continue`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return handleApiResponse<void>(response);
    },

    createPR: async (
      attemptId: string,
      data: CreatePrApiRequest
    ): Promise<Result<string, PrError>> => {
      const response = await makeReq(`/api/task-attempts/${attemptId}/pr`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponseAsResult<string, PrError>(response);
    },

    startDevServer: async (attemptId: string): Promise<ExecutionProcess[]> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/start-dev-server`,
        {
          method: 'POST',
        }
      );
      return handleApiResponse<ExecutionProcess[]>(response);
    },

    setupGhCli: async (attemptId: string): Promise<ExecutionProcess> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/gh-cli-setup`,
        {
          method: 'POST',
        }
      );
      return handleApiResponse<ExecutionProcess, GhCliSetupError>(response);
    },

    runSetupScript: async (
      attemptId: string
    ): Promise<Result<ExecutionProcess, RunScriptError>> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/run-setup-script`,
        {
          method: 'POST',
        }
      );
      return handleApiResponseAsResult<ExecutionProcess, RunScriptError>(
        response
      );
    },

    runCleanupScript: async (
      attemptId: string
    ): Promise<Result<ExecutionProcess, RunScriptError>> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/run-cleanup-script`,
        {
          method: 'POST',
        }
      );
      return handleApiResponseAsResult<ExecutionProcess, RunScriptError>(
        response
      );
    },

    runArchiveScript: async (
      attemptId: string
    ): Promise<Result<ExecutionProcess, RunScriptError>> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/run-archive-script`,
        {
          method: 'POST',
        }
      );
      return handleApiResponseAsResult<ExecutionProcess, RunScriptError>(
        response
      );
    },

    getPrComments: async (
      attemptId: string,
      repoId: string
    ): Promise<PrCommentsResponse> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/pr/comments?repo_id=${encodeURIComponent(repoId)}`
      );
      return handleApiResponse<PrCommentsResponse>(response);
    },

    /** Mark all coding agent turns for a workspace as seen */
    markSeen: async (attemptId: string): Promise<void> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/mark-seen`,
        {
          method: 'PUT',
        }
      );
      return handleApiResponse<void>(response);
    },

    /** Create a workspace directly from a pull request */
    createFromPr: async (
      data: CreateWorkspaceFromPrBody
    ): Promise<Result<CreateWorkspaceFromPrResponse, CreateFromPrError>> => {
      const response = await makeReq('/api/task-attempts/from-pr', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponseAsResult<
        CreateWorkspaceFromPrResponse,
        CreateFromPrError
      >(response);
    },

    /** Get commit history for a task attempt's branch */
    getCommitHistory: async (
      attemptId: string,
      repoId: string,
      limit: number = 50,
      skip: number = 0
    ): Promise<CommitHistoryResponse> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/commits?repo_id=${repoId}&limit=${limit}&skip=${skip}`
      );
      return handleApiResponse<CommitHistoryResponse>(response);
    },

    /** Get diff for a specific commit */
    getCommitDiff: async (
      attemptId: string,
      sha: string,
      repoId: string
    ): Promise<Diff[]> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/commits/${sha}/diff?repo_id=${repoId}`
      );
      return handleApiResponse<Diff[]>(response);
    },

    /** Get workspace diffs by comparing worktree against target branch */
    getWorkspaceDiffs: async (
      attemptId: string,
      repoId: string
    ): Promise<Diff[]> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/diff?repo_id=${repoId}`
      );
      return handleApiResponse<Diff[]>(response);
    },

    /** Revert a specific commit */
    revertCommit: async (
      attemptId: string,
      sha: string,
      repoId: string
    ): Promise<void> => {
      const response = await makeReq(
        `/api/task-attempts/${attemptId}/commits/${sha}/revert`,
        {
          method: 'POST',
          body: JSON.stringify({ repo_id: repoId }),
        }
      );
      return handleApiResponse<void>(response);
    },
  };

  const _sessionsApi = {
    getByWorkspace: async (workspaceId: string): Promise<Session[]> => {
      const response = await makeReq(
        `/api/sessions?workspace_id=${workspaceId}`
      );
      return handleApiResponse<Session[]>(response);
    },

    getById: async (sessionId: string): Promise<Session> => {
      const response = await makeReq(`/api/sessions/${sessionId}`);
      return handleApiResponse<Session>(response);
    },

    create: async (data: {
      workspace_id: string;
      executor?: string;
    }): Promise<Session> => {
      const response = await makeReq('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponse<Session>(response);
    },

    followUp: async (
      sessionId: string,
      data: CreateFollowUpAttempt
    ): Promise<ExecutionProcess> => {
      const response = await makeReq(`/api/sessions/${sessionId}/follow-up`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponse<ExecutionProcess>(response);
    },

    startReview: async (
      sessionId: string,
      data: StartReviewRequest
    ): Promise<ExecutionProcess> => {
      const response = await makeReq(`/api/sessions/${sessionId}/review`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponse<ExecutionProcess, ReviewError>(response);
    },

    reset: async (
      sessionId: string,
      data: ResetProcessRequest
    ): Promise<void> => {
      const response = await makeReq(`/api/sessions/${sessionId}/reset`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return handleApiResponse<void>(response);
    },
  };

  return {
    projectsApi: {
      getAll: async (): Promise<Project[]> => {
        const response = await makeReq('/api/projects');
        return handleApiResponse<Project[]>(response);
      },

      create: async (data: CreateProject): Promise<Project> => {
        const response = await makeReq('/api/projects', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Project>(response);
      },

      update: async (id: string, data: UpdateProject): Promise<Project> => {
        const response = await makeReq(`/api/projects/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Project>(response);
      },

      delete: async (id: string): Promise<void> => {
        const response = await makeReq(`/api/projects/${id}`, {
          method: 'DELETE',
        });
        return handleApiResponse<void>(response);
      },

      openEditor: async (
        id: string,
        data: OpenEditorRequest
      ): Promise<OpenEditorResponse> => {
        const response = await makeReq(`/api/projects/${id}/open-editor`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<OpenEditorResponse>(response);
      },

      searchFiles: async (
        id: string,
        query: string,
        mode?: SearchMode,
        options?: RequestInit
      ): Promise<SearchResult[]> => {
        const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : '';
        const response = await makeReq(
          `/api/projects/${id}/search?q=${encodeURIComponent(query)}${modeParam}`,
          options
        );
        return handleApiResponse<SearchResult[]>(response);
      },

      getRepositories: async (projectId: string): Promise<Repo[]> => {
        const response = await makeReq(
          `/api/projects/${projectId}/repositories`
        );
        return handleApiResponse<Repo[]>(response);
      },

      addRepository: async (
        projectId: string,
        data: CreateProjectRepo
      ): Promise<Repo> => {
        const response = await makeReq(
          `/api/projects/${projectId}/repositories`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        );
        return handleApiResponse<Repo>(response);
      },

      deleteRepository: async (
        projectId: string,
        repoId: string
      ): Promise<void> => {
        const response = await makeReq(
          `/api/projects/${projectId}/repositories/${repoId}`,
          {
            method: 'DELETE',
          }
        );
        return handleApiResponse<void>(response);
      },
    },

    tasksApi: {
      getById: async (taskId: string): Promise<Task> => {
        const response = await makeReq(`/api/tasks/${taskId}`);
        return handleApiResponse<Task>(response);
      },

      create: async (data: CreateTask): Promise<Task> => {
        const response = await makeReq(`/api/tasks`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Task>(response);
      },

      createAndStart: async (
        data: CreateAndStartTaskRequest
      ): Promise<Task> => {
        const response = await makeReq(`/api/tasks/create-and-start`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Task>(response);
      },

      update: async (taskId: string, data: UpdateTask): Promise<Task> => {
        const response = await makeReq(`/api/tasks/${taskId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Task>(response);
      },

      delete: async (taskId: string): Promise<void> => {
        const response = await makeReq(`/api/tasks/${taskId}`, {
          method: 'DELETE',
        });
        return handleApiResponse<void>(response);
      },

      getHistory: async (
        projectId: string,
        params?: { cursor?: string; limit?: number }
      ): Promise<PaginatedTaskHistory> => {
        const search = new URLSearchParams({ project_id: projectId });
        if (params?.cursor) search.set('cursor', params.cursor);
        if (params?.limit) search.set('limit', String(params.limit));
        const response = await makeReq(`/api/tasks/history?${search}`);
        return handleApiResponse<PaginatedTaskHistory>(response);
      },

      getConversationContext: async (
        taskId: string
      ): Promise<ConversationContextResponse> => {
        const response = await makeReq(
          `/api/tasks/${taskId}/conversation-context`
        );
        return handleApiResponse<ConversationContextResponse>(response);
      },
    },

    sessionsApi: _sessionsApi,

    attemptsApi: _attemptsApi,

    executionProcessesApi: {
      getDetails: async (processId: string): Promise<ExecutionProcess> => {
        const response = await makeReq(`/api/execution-processes/${processId}`);
        return handleApiResponse<ExecutionProcess>(response);
      },

      getRepoStates: async (
        processId: string
      ): Promise<ExecutionProcessRepoState[]> => {
        const response = await makeReq(
          `/api/execution-processes/${processId}/repo-states`
        );
        return handleApiResponse<ExecutionProcessRepoState[]>(response);
      },

      stopExecutionProcess: async (processId: string): Promise<void> => {
        const response = await makeReq(
          `/api/execution-processes/${processId}/stop`,
          {
            method: 'POST',
          }
        );
        return handleApiResponse<void>(response);
      },

      getEntries: async (
        processId: string,
        before?: number,
        limit: number = 50
      ): Promise<PaginatedNormalizedEntries> => {
        const params = new URLSearchParams({ limit: String(limit) });
        if (before !== undefined) {
          params.set('before', String(before));
        }
        const response = await makeReq(
          `/api/execution-processes/${processId}/entries?${params}`
        );
        return handleApiResponse<PaginatedNormalizedEntries>(response);
      },
    },

    fileSystemApi: {
      list: async (path?: string): Promise<DirectoryListResponse> => {
        const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
        const response = await makeReq(
          `/api/filesystem/directory${queryParam}`
        );
        return handleApiResponse<DirectoryListResponse>(response);
      },

      listGitRepos: async (path?: string): Promise<DirectoryEntry[]> => {
        const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
        const response = await makeReq(
          `/api/filesystem/git-repos${queryParam}`
        );
        return handleApiResponse<DirectoryEntry[]>(response);
      },
    },

    repoApi: {
      list: async (): Promise<Repo[]> => {
        const response = await makeReq('/api/repos');
        return handleApiResponse<Repo[]>(response);
      },

      listRecent: async (): Promise<Repo[]> => {
        const response = await makeReq('/api/repos/recent');
        return handleApiResponse<Repo[]>(response);
      },

      getById: async (repoId: string): Promise<Repo> => {
        const response = await makeReq(`/api/repos/${repoId}`);
        return handleApiResponse<Repo>(response);
      },

      update: async (repoId: string, data: UpdateRepo): Promise<Repo> => {
        const response = await makeReq(`/api/repos/${repoId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Repo>(response);
      },

      register: async (data: {
        path: string;
        display_name?: string;
      }): Promise<Repo> => {
        const response = await makeReq('/api/repos', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Repo>(response);
      },

      getBranches: async (repoId: string): Promise<GitBranch[]> => {
        const response = await makeReq(`/api/repos/${repoId}/branches`);
        return handleApiResponse<GitBranch[]>(response);
      },

      init: async (data: {
        parent_path: string;
        folder_name: string;
      }): Promise<Repo> => {
        const response = await makeReq('/api/repos/init', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Repo>(response);
      },

      getBatch: async (ids: string[]): Promise<Repo[]> => {
        const response = await makeReq('/api/repos/batch', {
          method: 'POST',
          body: JSON.stringify({ ids }),
        });
        return handleApiResponse<Repo[]>(response);
      },

      openEditor: async (
        repoId: string,
        data: OpenEditorRequest
      ): Promise<OpenEditorResponse> => {
        const response = await makeReq(`/api/repos/${repoId}/open-editor`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<OpenEditorResponse>(response);
      },

      searchFiles: async (
        repoId: string,
        query: string,
        mode?: SearchMode,
        options?: RequestInit
      ): Promise<SearchResult[]> => {
        const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : '';
        const response = await makeReq(
          `/api/repos/${repoId}/search?q=${encodeURIComponent(query)}${modeParam}`,
          options
        );
        return handleApiResponse<SearchResult[]>(response);
      },

      listOpenPrs: async (
        repoId: string,
        remoteName?: string
      ): Promise<Result<OpenPrInfo[], ListPrsError>> => {
        const params = remoteName
          ? `?remote=${encodeURIComponent(remoteName)}`
          : '';
        const response = await makeReq(`/api/repos/${repoId}/prs${params}`);
        return handleApiResponseAsResult<OpenPrInfo[], ListPrsError>(response);
      },

      listRemotes: async (repoId: string): Promise<GitRemote[]> => {
        const response = await makeReq(`/api/repos/${repoId}/remotes`);
        return handleApiResponse<GitRemote[]>(response);
      },
    },

    configApi: {
      getConfig: async (): Promise<UserSystemInfo> => {
        const response = await makeReq('/api/info', {
          cache: 'no-store',
        });
        return handleApiResponse<UserSystemInfo>(response);
      },
      saveConfig: async (config: Config): Promise<Config> => {
        const response = await makeReq('/api/config', {
          method: 'PUT',
          body: JSON.stringify(config),
        });
        return handleApiResponse<Config>(response);
      },
      checkEditorAvailability: async (
        editorType: EditorType
      ): Promise<CheckEditorAvailabilityResponse> => {
        const response = await makeReq(
          `/api/editors/check-availability?editor_type=${encodeURIComponent(editorType)}`
        );
        return handleApiResponse<CheckEditorAvailabilityResponse>(response);
      },
      checkAgentAvailability: async (
        agent: BaseCodingAgent
      ): Promise<AvailabilityInfo> => {
        const response = await makeReq(
          `/api/agents/check-availability?executor=${encodeURIComponent(agent)}`
        );
        return handleApiResponse<AvailabilityInfo>(response);
      },
    },

    tagsApi: {
      list: async (params?: TagSearchParams): Promise<Tag[]> => {
        const queryParam = params?.search
          ? `?search=${encodeURIComponent(params.search)}`
          : '';
        const response = await makeReq(`/api/tags${queryParam}`);
        return handleApiResponse<Tag[]>(response);
      },

      create: async (data: CreateTag): Promise<Tag> => {
        const response = await makeReq('/api/tags', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Tag>(response);
      },

      update: async (tagId: string, data: UpdateTag): Promise<Tag> => {
        const response = await makeReq(`/api/tags/${tagId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Tag>(response);
      },

      delete: async (tagId: string): Promise<void> => {
        const response = await makeReq(`/api/tags/${tagId}`, {
          method: 'DELETE',
        });
        return handleApiResponse<void>(response);
      },
    },

    mcpServersApi: {
      load: async (query: McpServerQuery): Promise<GetMcpServerResponse> => {
        const params = new URLSearchParams(query);
        const response = await makeReq(`/api/mcp-config?${params.toString()}`);
        return handleApiResponse<GetMcpServerResponse>(response);
      },
      save: async (
        query: McpServerQuery,
        data: UpdateMcpServersBody
      ): Promise<void> => {
        const params = new URLSearchParams(query);
        const response = await makeReq(`/api/mcp-config?${params.toString()}`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const errorData = await response.json();
          console.error('[API Error] Failed to save MCP servers', {
            message: errorData.message,
            status: response.status,
            response,
            timestamp: new Date().toISOString(),
          });
          throw new ApiError(
            errorData.message || 'Failed to save MCP servers',
            response.status,
            response
          );
        }
      },
    },

    profilesApi: {
      load: async (): Promise<{ content: string; path: string }> => {
        const response = await makeReq('/api/profiles');
        return handleApiResponse<{ content: string; path: string }>(response);
      },
      save: async (content: string): Promise<string> => {
        const response = await makeReq('/api/profiles', {
          method: 'PUT',
          body: content,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        return handleApiResponse<string>(response);
      },
      getInteractiveCommand: async (
        executor: string,
        variant: string
      ): Promise<{ command: string }> => {
        const response = await makeReq(
          `/api/profiles/${encodeURIComponent(executor)}/${encodeURIComponent(variant)}/interactive-command`
        );
        return handleApiResponse<{ command: string }>(response);
      },
    },

    configTransferApi: {
      exportConfig: async (): Promise<ConfigExportEnvelope> => {
        const response = await makeReq('/api/config/export');
        return handleApiResponse<ConfigExportEnvelope>(response);
      },
      importConfig: async (
        sections: Record<string, unknown>
      ): Promise<ConfigImportResult> => {
        const response = await makeReq('/api/config/import', {
          method: 'POST',
          body: JSON.stringify({ sections }),
        });
        return handleApiResponse<ConfigImportResult>(response);
      },
    },

    imagesApi: {
      upload: async (file: File): Promise<ImageResponse> => {
        const formData = new FormData();
        formData.append('image', file);

        const response = await uploadFd('/api/images/upload', formData);

        if (!response.ok) {
          const errorText = await response.text();
          throw new ApiError(
            `Failed to upload image: ${errorText}`,
            response.status,
            response
          );
        }

        return handleApiResponse<ImageResponse>(response);
      },

      uploadForTask: async (
        taskId: string,
        file: File
      ): Promise<ImageResponse> => {
        const formData = new FormData();
        formData.append('image', file);

        const response = await uploadFd(
          `/api/images/task/${taskId}/upload`,
          formData
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new ApiError(
            `Failed to upload image: ${errorText}`,
            response.status,
            response
          );
        }

        return handleApiResponse<ImageResponse>(response);
      },

      /**
       * Upload an image for a task attempt and immediately copy it to the container.
       * Returns the image with a file_path that can be used in markdown.
       */
      uploadForAttempt: async (
        attemptId: string,
        file: File
      ): Promise<ImageResponse> => {
        const formData = new FormData();
        formData.append('image', file);

        const response = await uploadFd(
          `/api/task-attempts/${attemptId}/images/upload`,
          formData
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new ApiError(
            `Failed to upload image: ${errorText}`,
            response.status,
            response
          );
        }

        return handleApiResponse<ImageResponse>(response);
      },

      delete: async (imageId: string): Promise<void> => {
        const response = await makeReq(`/api/images/${imageId}`, {
          method: 'DELETE',
        });
        return handleApiResponse<void>(response);
      },

      getTaskImages: async (taskId: string): Promise<ImageResponse[]> => {
        const response = await makeReq(`/api/images/task/${taskId}`);
        return handleApiResponse<ImageResponse[]>(response);
      },

      getImageUrl: (imageId: string): string => {
        return `/api/images/${imageId}/file`;
      },
    },

    approvalsApi: {
      respond: async (
        approvalId: string,
        payload: ApprovalResponse,
        signal?: AbortSignal
      ): Promise<ApprovalStatus> => {
        const res = await makeReq(`/api/approvals/${approvalId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        });

        return handleApiResponse<ApprovalStatus>(res);
      },
    },

    oauthApi: {
      handoffInit: async (
        provider: string,
        returnTo: string
      ): Promise<{ handoff_id: string; authorize_url: string }> => {
        const response = await makeReq('/api/auth/handoff/init', {
          method: 'POST',
          body: JSON.stringify({ provider, return_to: returnTo }),
        });
        return handleApiResponse<{
          handoff_id: string;
          authorize_url: string;
        }>(response);
      },

      status: async (): Promise<StatusResponse> => {
        const response = await makeReq('/api/auth/status', {
          cache: 'no-store',
        });
        return handleApiResponse<StatusResponse>(response);
      },

      logout: async (): Promise<void> => {
        const response = await makeReq('/api/auth/logout', {
          method: 'POST',
        });
        if (!response.ok) {
          throw new ApiError(
            `Logout failed with status ${response.status}`,
            response.status,
            response
          );
        }
      },
    },

    scratchApi: {
      create: async (
        scratchType: ScratchType,
        id: string,
        data: CreateScratch
      ): Promise<Scratch> => {
        const response = await makeReq(`/api/scratch/${scratchType}/${id}`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<Scratch>(response);
      },

      get: async (scratchType: ScratchType, id: string): Promise<Scratch> => {
        const response = await makeReq(`/api/scratch/${scratchType}/${id}`);
        return handleApiResponse<Scratch>(response);
      },

      update: async (
        scratchType: ScratchType,
        id: string,
        data: UpdateScratch
      ): Promise<void> => {
        const response = await makeReq(`/api/scratch/${scratchType}/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return handleApiResponse<void>(response);
      },

      delete: async (scratchType: ScratchType, id: string): Promise<void> => {
        const response = await makeReq(`/api/scratch/${scratchType}/${id}`, {
          method: 'DELETE',
        });
        return handleApiResponse<void>(response);
      },

      getStreamUrl: (scratchType: ScratchType, id: string): string =>
        `/api/scratch/${scratchType}/${id}/stream/ws`,
    },

    agentsApi: {
      getSlashCommandsStreamUrl: (
        agent: BaseCodingAgent,
        opts?: { workspaceId?: string; repoId?: string }
      ): string => {
        const params = new URLSearchParams();
        params.set('executor', agent);
        if (opts?.workspaceId) params.set('workspace_id', opts.workspaceId);
        if (opts?.repoId) params.set('repo_id', opts.repoId);

        return `/api/agents/slash-commands/ws?${params.toString()}`;
      },
    },

    queueApi: {
      /**
       * Queue a follow-up message to be executed when current execution finishes
       */
      queue: async (
        sessionId: string,
        data: {
          message: string;
          executor_profile_id: ExecutorProfileId;
        }
      ): Promise<QueueStatus> => {
        const response = await makeReq(`/api/sessions/${sessionId}/queue`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return handleApiResponse<QueueStatus>(response);
      },

      /**
       * Cancel a queued follow-up message
       */
      cancel: async (sessionId: string): Promise<QueueStatus> => {
        const response = await makeReq(`/api/sessions/${sessionId}/queue`, {
          method: 'DELETE',
        });
        return handleApiResponse<QueueStatus>(response);
      },

      /**
       * Get the current queue status for a session
       */
      getStatus: async (sessionId: string): Promise<QueueStatus> => {
        const response = await makeReq(`/api/sessions/${sessionId}/queue`);
        return handleApiResponse<QueueStatus>(response);
      },
    },

    searchApi: {
      searchFiles: async (
        repoIds: string[],
        query: string,
        mode?: SearchMode,
        options?: RequestInit
      ): Promise<SearchResult[]> => {
        const repoIdsParam = repoIds.join(',');
        const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : '';
        const response = await makeReq(
          `/api/search?q=${encodeURIComponent(query)}&repo_ids=${encodeURIComponent(repoIdsParam)}${modeParam}`,
          options
        );
        return handleApiResponse<SearchResult[]>(response);
      },
    },

    systemApi: {
      getHomeDir: async (): Promise<{ home_dir: string }> => {
        const response = await makeReq('/api/terminal/home-dir');
        const data = await response.json();
        return data;
      },
    },
  };
}

export type ApiNamespaces = ReturnType<typeof createApi>;
