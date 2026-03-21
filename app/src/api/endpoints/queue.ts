import { get, post, del } from '../client';
import type { QueueStatus, DraftFollowUpData, ExecutorProfileId } from '../types';

export const queueApi = {
  getStatus: (sessionId: string) => get<QueueStatus>(`/api/sessions/${sessionId}/queue`),
  enqueue: (sessionId: string, data: DraftFollowUpData) => post(`/api/sessions/${sessionId}/queue`, data),
  dequeue: (sessionId: string) => del(`/api/sessions/${sessionId}/queue`),
};
