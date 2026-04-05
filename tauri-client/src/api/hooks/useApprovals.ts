import {
  useMutation,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type { ApprovalOutcome, ApprovalResponse } from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Mutation Hooks ─────────────────────────────────────────────────────────

export function useRespondToApproval(
  options?: UseMutationOptions<
    ApprovalResponse,
    ApiError,
    { id: string; outcome: ApprovalOutcome }
  >,
) {
  return useMutation<
    ApprovalResponse,
    ApiError,
    { id: string; outcome: ApprovalOutcome }
  >({
    mutationFn: ({ id, outcome }) =>
      apiClient.post<ApprovalResponse>(
        `/approvals/${id}/respond`,
        outcome,
      ),
    ...options,
  });
}
