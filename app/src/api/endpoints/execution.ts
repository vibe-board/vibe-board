import { get, post } from '../client';
import type { ExecutionProcess, Diff, NormalizedEntry, PatchType } from '../types';

export const executionApi = {
  listForSession: (sessionId: string) => get<ExecutionProcess[]>(`/api/execution-processes`, { session_id: sessionId }),
  get: (id: string) => get<ExecutionProcess>(`/api/execution-processes/${id}`),
  getLogs: (processId: string) => get<PatchType[]>(`/api/execution-processes/${processId}/patches`),
  getDiffs: (processId: string) => get<Diff[]>(`/api/execution-processes/${processId}/diffs`),
  kill: (processId: string) => post(`/api/execution-processes/${processId}/kill`),
};
