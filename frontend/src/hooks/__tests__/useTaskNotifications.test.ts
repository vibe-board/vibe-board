import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, ApprovalInfo, Config } from 'shared/types';
import { useTaskNotifications } from '../useTaskNotifications';
import { useTabNotificationStore } from '@/stores/tab-notification-store';

// Mock the connection context
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({ url: 'http://localhost' }),
}));

// Mock notification sound
vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(() => Promise.resolve()),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    status: 'running',
    executor: 'claude',
    project_id: 'proj-1',
    ...overrides,
  } as Task;
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    notifications: {
      sound_enabled: false,
      push_enabled: false,
      sound_file: 'CowMooing',
    },
    ...overrides,
  } as Config;
}

describe('useTaskNotifications — tab notification integration', () => {
  beforeEach(() => {
    useTabNotificationStore.getState().clearAll();
    vi.clearAllMocks();
  });

  it('marks tab notification when task transitions to inreview', () => {
    const initialTasks = { 'task-1': makeTask({ status: 'running' }) };
    const { rerender } = renderHook(
      ({ tasks, tabId }) =>
        useTaskNotifications(tasks, [], makeConfig(), tabId),
      { initialProps: { tasks: initialTasks, tabId: 'tab-1' } }
    );

    // Simulate task status change to inreview
    const updatedTasks = { 'task-1': makeTask({ status: 'inreview' }) };
    rerender({ tasks: updatedTasks, tabId: 'tab-1' });

    expect(useTabNotificationStore.getState().notifications['tab-1']).toBe(
      true
    );
  });

  it('marks tab notification when new approval appears', () => {
    const { rerender } = renderHook(
      ({ approvals, tabId }) =>
        useTaskNotifications({}, approvals, makeConfig(), tabId),
      {
        initialProps: {
          approvals: [] as ApprovalInfo[],
          tabId: 'tab-1',
        },
      }
    );

    const newApproval: ApprovalInfo = {
      approval_id: 'a1',
      tool_name: 'Bash',
      execution_process_id: 'ep1',
      task_id: 'task-1',
      is_question: false,
      created_at: '2026-06-03T00:00:00Z',
      timeout_at: '2026-06-03T00:01:00Z',
    } as ApprovalInfo;

    rerender({ approvals: [newApproval], tabId: 'tab-1' });

    expect(useTabNotificationStore.getState().notifications['tab-1']).toBe(
      true
    );
  });

  it('does not mark tab notification when tabId is undefined', () => {
    const initialTasks = { 'task-1': makeTask({ status: 'running' }) };
    const { rerender } = renderHook(
      ({ tasks }) => useTaskNotifications(tasks, [], makeConfig()),
      { initialProps: { tasks: initialTasks } }
    );

    const updatedTasks = { 'task-1': makeTask({ status: 'inreview' }) };
    rerender({ tasks: updatedTasks });

    expect(useTabNotificationStore.getState().notifications).toEqual({});
  });
});
