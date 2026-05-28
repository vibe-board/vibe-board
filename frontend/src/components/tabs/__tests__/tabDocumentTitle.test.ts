import { describe, expect, it } from 'vitest';
import type { TabPersisted } from '@/lib/connections/types';
import { getTabDocumentTitle } from '../tabDocumentTitle';

describe('getTabDocumentTitle', () => {
  const tabs: TabPersisted[] = [
    {
      id: 'machine-tab',
      type: 'machine-projects',
      connectionId: 'gateway-self',
      machineId: 'machine-1',
      label: 'devbox',
    },
    {
      id: 'project-tab',
      type: 'project',
      connectionId: 'gateway-self',
      machineId: 'machine-1',
      projectId: 'project-1',
      label: 'vibe-kanban',
    },
  ];

  it('uses the app title for the home tab', () => {
    expect(getTabDocumentTitle('home', tabs)).toBe('vibe-board');
  });

  it('uses the active tab label for project and machine tabs', () => {
    expect(getTabDocumentTitle('machine-tab', tabs)).toBe(
      'devbox | vibe-board'
    );
    expect(getTabDocumentTitle('project-tab', tabs)).toBe(
      'vibe-kanban | vibe-board'
    );
  });

  it('falls back to the app title when the active tab is missing', () => {
    expect(getTabDocumentTitle('closed-tab', tabs)).toBe('vibe-board');
  });

  it('falls back to the app title when the active tab label is blank', () => {
    expect(
      getTabDocumentTitle('blank-tab', [
        {
          id: 'blank-tab',
          type: 'project',
          connectionId: 'direct-1',
          projectId: 'project-2',
          label: '   ',
        },
      ])
    ).toBe('vibe-board');
  });
});
