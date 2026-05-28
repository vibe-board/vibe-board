import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalInfo } from 'shared/types';
import {
  TaskApprovalsProvider,
  useTaskApprovalsIndex,
} from '@/contexts/TaskApprovalsContext';
import { useTaskApprovalIndicator } from '../useTaskApprovalIndicator';

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

// Module-scoped, mutable so the wrapper closes over the latest array on each
// render. Reset in beforeEach.
let currentPendingApprovals: ApprovalInfo[] = [];

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    TaskApprovalsProvider,
    { pendingApprovals: currentPendingApprovals },
    children
  );
}

describe('useTaskApprovalIndicator', () => {
  beforeEach(() => {
    localStorage.clear();
    currentPendingApprovals = [];
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when the task has no pending approvals', () => {
    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-other' }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current).toBeNull();
  });

  it('returns kind="tool_approval" for is_question=false', () => {
    currentPendingApprovals = [
      makeApproval({
        approval_id: 'a1',
        task_id: 'task-1',
        is_question: false,
        tool_name: 'Bash',
      }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.kind).toBe('tool_approval');
    expect(result.current?.toolName).toBe('Bash');
    expect(result.current?.approvalIds).toEqual(['a1']);
  });

  it('returns kind="question" for is_question=true', () => {
    currentPendingApprovals = [
      makeApproval({
        approval_id: 'a1',
        task_id: 'task-1',
        is_question: true,
        tool_name: 'AskUserQuestion',
      }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.kind).toBe('question');
  });

  it('prioritises question over tool_approval when both exist', () => {
    currentPendingApprovals = [
      makeApproval({
        approval_id: 'a1',
        task_id: 'task-1',
        is_question: false,
        tool_name: 'Bash',
      }),
      makeApproval({
        approval_id: 'a2',
        task_id: 'task-1',
        is_question: true,
        tool_name: 'AskUserQuestion',
      }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.kind).toBe('question');
    expect(result.current?.toolName).toBe('AskUserQuestion');
    expect(result.current?.approvalIds.sort()).toEqual(['a1', 'a2']);
  });

  it('seen is false when storage is empty', () => {
    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.seen).toBe(false);
  });

  it('seen flips true after markSeen, false again when a new approval arrives', () => {
    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    const { result, rerender } = renderHook(
      () => {
        const idx = useTaskApprovalsIndex();
        const indicator = useTaskApprovalIndicator('task-1');
        return { idx, indicator };
      },
      { wrapper }
    );
    act(() => {
      result.current.idx.markSeen('task-1');
    });
    rerender();
    expect(result.current.indicator?.seen).toBe(true);

    currentPendingApprovals = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1', is_question: true }),
    ];
    rerender();
    expect(result.current.indicator?.seen).toBe(false);
  });
});
