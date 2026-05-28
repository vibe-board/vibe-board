import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalInfo } from 'shared/types';
import {
  TaskApprovalsProvider,
  useTaskApprovalsIndex,
} from '../TaskApprovalsContext';
import {
  SEEN_APPROVALS_KEY,
  loadSeenApprovals,
} from '@/hooks/seenApprovalsStorage';

function makeApproval(overrides: Partial<ApprovalInfo>): ApprovalInfo {
  return {
    approval_id: 'a1',
    tool_name: 'Bash',
    execution_process_id: 'ep1',
    task_id: 'task-1',
    is_question: false,
    created_at: '2026-05-28T00:00:00Z',
    timeout_at: '2026-05-28T00:01:00Z',
    ...overrides,
  } as ApprovalInfo;
}

// Module-scoped, mutable so a wrapper can close over it and pick up the latest
// array on each render. Reset in beforeEach.
let currentPendingApprovals: ApprovalInfo[] = [];

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TaskApprovalsProvider pendingApprovals={currentPendingApprovals}>
      {children}
    </TaskApprovalsProvider>
  );
}

describe('useTaskApprovalsIndex', () => {
  beforeEach(() => {
    localStorage.clear();
    currentPendingApprovals = [];
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('groups approvals by task_id', () => {
    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1', is_question: true }),
      makeApproval({ approval_id: 'a3', task_id: 'task-2' }),
    ];
    const { result } = renderHook(() => useTaskApprovalsIndex(), { wrapper });
    expect(
      result.current.byTaskId.get('task-1')?.map((a) => a.approval_id)
    ).toEqual(['a1', 'a2']);
    expect(
      result.current.byTaskId.get('task-2')?.map((a) => a.approval_id)
    ).toEqual(['a3']);
  });

  it('markSeen writes approval ids for the given task', () => {
    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a3', task_id: 'task-2' }),
    ];
    const { result } = renderHook(() => useTaskApprovalsIndex(), { wrapper });
    act(() => {
      result.current.markSeen('task-1');
    });
    const stored = loadSeenApprovals();
    expect(Object.keys(stored).sort()).toEqual(['a1', 'a2']);
    expect(stored.a3).toBeUndefined();
  });

  it('markSeen on a task with no pending approvals is a no-op', () => {
    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    const { result } = renderHook(() => useTaskApprovalsIndex(), { wrapper });
    act(() => {
      result.current.markSeen('task-other');
    });
    expect(localStorage.getItem(SEEN_APPROVALS_KEY)).toBeNull();
  });

  it('GC prunes seen ids that are no longer in pending', () => {
    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1' }),
    ];
    const { result, rerender } = renderHook(() => useTaskApprovalsIndex(), {
      wrapper,
    });
    act(() => {
      result.current.markSeen('task-1');
    });
    expect(Object.keys(loadSeenApprovals()).sort()).toEqual(['a1', 'a2']);

    currentPendingApprovals = [
      makeApproval({ approval_id: 'a2', task_id: 'task-1' }),
    ];
    rerender();
    expect(Object.keys(loadSeenApprovals())).toEqual(['a2']);
  });

  it('all consumers under one provider share the same Map identity per render', () => {
    const pendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    let firstSeen: unknown;
    let secondSeen: unknown;
    function Probe({ label }: { label: string }) {
      const idx = useTaskApprovalsIndex();
      if (label === 'first') firstSeen = idx.byTaskId;
      if (label === 'second') secondSeen = idx.byTaskId;
      return null;
    }
    render(
      <TaskApprovalsProvider pendingApprovals={pendingApprovals}>
        <Probe label="first" />
        <Probe label="second" />
      </TaskApprovalsProvider>
    );
    expect(firstSeen).toBe(secondSeen);
  });
});
