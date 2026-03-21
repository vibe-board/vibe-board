import { get, post } from '../client';
import type { Session, CreateTaskAttemptBody, CreateFollowUpAttempt, WorkspaceSummaryResponse } from '../types';

export const sessionsApi = {
  listForWorkspace: (workspaceId: string) => get<Session[]>(`/api/sessions`, { workspace_id: workspaceId }),
  get: (id: string) => get<Session>(`/api/sessions/${id}`),
  createAttempt: (workspaceId: string, data: CreateTaskAttemptBody) => post(`/api/task-attempts/${workspaceId}/start`, data),
  createFollowUp: (sessionId: string, data: CreateFollowUpAttempt) => post(`/api/task-attempts/${sessionId}/follow-up`, data),
  getWorkspaceSummaries: (projectId: string, archived: boolean) => get<WorkspaceSummaryResponse>(`/api/projects/${projectId}/workspace-summaries`, { archived }),
};
