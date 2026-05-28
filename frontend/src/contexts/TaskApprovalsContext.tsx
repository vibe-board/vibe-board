import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { ApprovalInfo } from 'shared/types';
import {
  markApprovalsSeen,
  pruneSeenApprovals,
} from '@/hooks/seenApprovalsStorage';

export interface TaskApprovalsIndex {
  byTaskId: Map<string, ApprovalInfo[]>;
  markSeen: (taskId: string) => void;
}

const TaskApprovalsContext = createContext<TaskApprovalsIndex | null>(null);

export function TaskApprovalsProvider({
  pendingApprovals,
  children,
}: {
  pendingApprovals: ApprovalInfo[];
  children: ReactNode;
}) {
  const byTaskId = useMemo(() => {
    const map = new Map<string, ApprovalInfo[]>();
    for (const approval of pendingApprovals) {
      const list = map.get(approval.task_id);
      if (list) list.push(approval);
      else map.set(approval.task_id, [approval]);
    }
    return map;
  }, [pendingApprovals]);

  // Garbage-collect any seen ids that no longer correspond to a live approval.
  useEffect(() => {
    const liveIds = new Set(pendingApprovals.map((a) => a.approval_id));
    pruneSeenApprovals(liveIds);
  }, [pendingApprovals]);

  const markSeen = useCallback(
    (taskId: string) => {
      const approvals = byTaskId.get(taskId);
      if (!approvals || approvals.length === 0) return;
      markApprovalsSeen(
        approvals.map((a) => a.approval_id),
        Date.now()
      );
    },
    [byTaskId]
  );

  const value = useMemo<TaskApprovalsIndex>(
    () => ({ byTaskId, markSeen }),
    [byTaskId, markSeen]
  );

  return (
    <TaskApprovalsContext.Provider value={value}>
      {children}
    </TaskApprovalsContext.Provider>
  );
}

export function useTaskApprovalsIndex(): TaskApprovalsIndex {
  const ctx = useContext(TaskApprovalsContext);
  if (!ctx) {
    throw new Error(
      'useTaskApprovalsIndex must be used inside <TaskApprovalsProvider>'
    );
  }
  return ctx;
}
