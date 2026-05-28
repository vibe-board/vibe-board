import type { ApprovalInfo } from 'shared/types';
import { useTaskApprovalsIndex } from '@/contexts/TaskApprovalsContext';
import { loadSeenApprovals } from './seenApprovalsStorage';

export type ApprovalIndicatorKind = 'question' | 'tool_approval';

export interface TaskApprovalIndicator {
  kind: ApprovalIndicatorKind;
  seen: boolean;
  approvalIds: string[];
  toolName: string;
}

function pickWinner(approvals: ApprovalInfo[]): ApprovalInfo {
  // Priority: AskUserQuestion (is_question) > tool approval.
  return approvals.find((a) => a.is_question) ?? approvals[0];
}

export function useTaskApprovalIndicator(
  taskId: string
): TaskApprovalIndicator | null {
  const { byTaskId } = useTaskApprovalsIndex();
  const approvals = byTaskId.get(taskId);

  if (!approvals || approvals.length === 0) return null;
  const winner = pickWinner(approvals);
  const seenMap = loadSeenApprovals();
  const approvalIds = approvals.map((a) => a.approval_id);
  const seen = approvalIds.every((id) => id in seenMap);
  return {
    kind: winner.is_question ? 'question' : 'tool_approval',
    seen,
    approvalIds,
    toolName: winner.tool_name,
  };
}
