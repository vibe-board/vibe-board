import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import {
  TerminalTargetProvider,
  useTerminalTargets,
  type TerminalTarget,
} from '../TerminalTargetContext';

function wrapper({ children }: { children: ReactNode }) {
  return <TerminalTargetProvider>{children}</TerminalTargetProvider>;
}

const homeTarget: TerminalTarget = {
  id: 'home:conn-1',
  label: 'Connection Terminal',
  type: 'home',
  connectionId: 'conn-1',
  cwd: '/home/user',
};

const projectTarget: TerminalTarget = {
  id: 'project:conn-1:project-1',
  label: 'Project Terminal',
  type: 'project',
  connectionId: 'conn-1',
  projectId: 'project-1',
  cwd: '/repo/project',
};

const taskTarget: TerminalTarget = {
  id: 'task:conn-1:attempt-1',
  label: 'Task Terminal',
  type: 'task',
  connectionId: 'conn-1',
  workspaceId: 'attempt-1',
  attemptId: 'attempt-1',
  taskId: 'task-1',
  cwd: '/worktree/project',
};

describe('TerminalTargetContext', () => {
  it('registers and unregisters targets by scope', () => {
    const { result, unmount } = renderHook(() => useTerminalTargets(), {
      wrapper,
    });

    act(() => {
      result.current.registerTargets('scope-1', [homeTarget]);
      result.current.registerTargets('scope-2', [projectTarget]);
    });

    expect(result.current.targets.map((target) => target.id)).toEqual([
      'home:conn-1',
      'project:conn-1:project-1',
    ]);

    act(() => result.current.unregisterTargets('scope-1'));

    expect(result.current.targets.map((target) => target.id)).toEqual([
      'project:conn-1:project-1',
    ]);

    unmount();
  });

  it('chooses task before project before home as the best enabled target', () => {
    const { result } = renderHook(() => useTerminalTargets(), { wrapper });

    act(() => {
      result.current.registerTargets('scope', [
        homeTarget,
        projectTarget,
        taskTarget,
      ]);
    });

    expect(result.current.getBestTarget()?.id).toBe('task:conn-1:attempt-1');
  });

  it('ignores disabled targets when choosing the best target', () => {
    const { result } = renderHook(() => useTerminalTargets(), { wrapper });

    act(() => {
      result.current.registerTargets('scope', [
        { ...taskTarget, disabled: true, disabledReason: 'No workspace' },
        projectTarget,
        homeTarget,
      ]);
    });

    expect(result.current.getBestTarget()?.id).toBe('project:conn-1:project-1');
  });
});
