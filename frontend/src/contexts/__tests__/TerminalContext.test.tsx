import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import { TerminalProvider, useTerminal } from '../TerminalContext';

const STORAGE_KEY = 'vibe-board:terminal-sessions';

function wrapper({ children }: { children: ReactNode }) {
  return <TerminalProvider>{children}</TerminalProvider>;
}

describe('TerminalContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('numbers new tabs with a single global counter across workspaces', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    act(() => {
      result.current.createTab('workspace-a', 'task-a', '/a', {
        type: 'project',
        projectId: 'a',
      });
      result.current.createTab('workspace-b', 'task-b', '/b', {
        type: 'home',
      });
      result.current.createTab('workspace-a', 'task-a', '/a', {
        type: 'project',
        projectId: 'a',
      });
    });

    const titles = result.current.getAllTabs().map((tab) => tab.title);
    expect(titles).toHaveLength(3);
    expect(new Set(titles)).toEqual(
      new Set(['Terminal 1', 'Terminal 2', 'Terminal 3'])
    );
  });

  it('does not reuse closed numbers (counter is monotonic)', () => {
    const { result } = renderHook(() => useTerminal(), { wrapper });

    act(() => {
      result.current.createTab('workspace-a', 'task-a', '/a', {
        type: 'project',
        projectId: 'a',
      });
      result.current.createTab('workspace-a', 'task-a', '/a', {
        type: 'project',
        projectId: 'a',
      });
    });

    const firstId = result.current.getAllTabs()[0].id;
    act(() => result.current.closeTab('workspace-a', firstId));

    act(() => {
      result.current.createTab('workspace-a', 'task-a', '/a', {
        type: 'project',
        projectId: 'a',
      });
    });

    const titles = result.current.getAllTabs().map((tab) => tab.title);
    expect(titles).toEqual(['Terminal 2', 'Terminal 3']);
  });

  it('migrates legacy per-workspace counter state by renumbering Terminal-N titles sequentially', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabsByWorkspace: {
          'workspace-a': [
            {
              id: 'term-old-1',
              title: 'Terminal 1',
              workspaceId: 'workspace-a',
              taskId: 'task-a',
              cwd: '/a',
              sessionId: null,
              context: { type: 'project', projectId: 'a' },
            },
          ],
          'workspace-b': [
            {
              id: 'term-old-2',
              title: 'Terminal 1',
              workspaceId: 'workspace-b',
              taskId: 'task-b',
              cwd: '/b',
              sessionId: null,
              context: { type: 'home' },
            },
          ],
        },
        activeTabByWorkspace: {},
        closedWorkspaces: [],
        tabCounterByWorkspace: { 'workspace-a': 1, 'workspace-b': 1 },
        globalActiveTabId: null,
      })
    );

    const { result } = renderHook(() => useTerminal(), { wrapper });

    const titles = result.current.getAllTabs().map((tab) => tab.title);
    expect(titles).toHaveLength(2);
    expect(new Set(titles)).toEqual(new Set(['Terminal 1', 'Terminal 2']));

    act(() => {
      result.current.createTab('workspace-c', 'task-c', '/c', {
        type: 'home',
      });
    });

    const newTab = result.current
      .getAllTabs()
      .find((tab) => tab.workspaceId === 'workspace-c');
    expect(newTab?.title).toBe('Terminal 3');
  });

  it('preserves user-renamed tab titles during migration', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabsByWorkspace: {
          'workspace-a': [
            {
              id: 'term-old-1',
              title: 'My Custom Name',
              workspaceId: 'workspace-a',
              taskId: 'task-a',
              cwd: '/a',
              sessionId: null,
              context: { type: 'project', projectId: 'a' },
            },
          ],
          'workspace-b': [
            {
              id: 'term-old-2',
              title: 'Terminal 1',
              workspaceId: 'workspace-b',
              taskId: 'task-b',
              cwd: '/b',
              sessionId: null,
              context: { type: 'home' },
            },
          ],
        },
        activeTabByWorkspace: {},
        closedWorkspaces: [],
        tabCounterByWorkspace: { 'workspace-a': 1, 'workspace-b': 1 },
        globalActiveTabId: null,
      })
    );

    const { result } = renderHook(() => useTerminal(), { wrapper });

    const titles = result.current.getAllTabs().map((tab) => tab.title);
    expect(titles).toContain('My Custom Name');
    expect(titles).toContain('Terminal 1');
  });
});
