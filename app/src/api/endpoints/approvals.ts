import { get, post } from '../client';
import type { ApprovalInfo } from '../types';

export const approvalsApi = {
  getPending: (processId: string) => get<ApprovalInfo | null>(`/api/approvals/${processId}/pending`),
  approve: (approvalId: string) => post(`/api/approvals/${approvalId}/approve`),
  deny: (approvalId: string, reason?: string) => post(`/api/approvals/${approvalId}/deny`, { reason }),
};
