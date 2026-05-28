import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TerminalTab } from '@/contexts/TerminalContext';
import { TerminalTabBar } from '../TerminalTabBar';

const tabs: TerminalTab[] = [
  {
    id: 'terminal-1',
    title: 'Terminal 1',
    workspaceId: 'workspace-1',
    taskId: 'task-1',
    cwd: '/tmp/project',
    sessionId: null,
    context: { type: 'project', projectId: 'project-1' },
  },
];

describe('TerminalTabBar', () => {
  it('collapses the drawer from the terminal tab bar', () => {
    const onCollapse = vi.fn();

    render(
      <TerminalTabBar
        tabs={tabs}
        activeTabId="terminal-1"
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
        newTabOptions={[]}
        onNewTab={vi.fn()}
        onCollapse={onCollapse}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse terminal' }));

    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});
