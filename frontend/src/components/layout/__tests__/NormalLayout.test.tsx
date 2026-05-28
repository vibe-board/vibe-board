import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NormalLayout } from '../NormalLayout';

const mocks = vi.hoisted(() => ({
  isDrawerOpen: false,
  collapseTerminalPanel: vi.fn(),
  resizeTerminalPanel: vi.fn(),
}));

vi.mock('@/contexts/TerminalContext', () => ({
  useTerminal: () => ({ isDrawerOpen: mocks.isDrawerOpen }),
}));

vi.mock('@/components/DevBanner', () => ({
  DevBanner: () => <div data-testid="dev-banner" />,
}));

vi.mock('@/components/layout/Navbar', () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

vi.mock('@/components/layout/TerminalBottomDrawer', () => ({
  TerminalBottomDrawer: () => <div data-testid="terminal-drawer" />,
}));

vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('react-resizable-panels', () => {
  const Panel = React.forwardRef<
    { collapse: () => void; resize: (size: number) => void },
    React.PropsWithChildren<{
      id?: string;
      panelRef?: React.Ref<{
        collapse: () => void;
        resize: (size: number) => void;
      }>;
    }>
  >(function MockPanel({ children, id, panelRef }, _ref) {
    React.useImperativeHandle(panelRef, () => ({
      collapse: id === 'terminal' ? mocks.collapseTerminalPanel : vi.fn(),
      resize: id === 'terminal' ? mocks.resizeTerminalPanel : vi.fn(),
    }));

    return <div data-testid={`panel-${id}`}>{children}</div>;
  });

  return {
    Group: ({ children }: React.PropsWithChildren) => (
      <div data-testid="panel-group">{children}</div>
    ),
    Panel,
    Separator: ({ children }: React.PropsWithChildren) => (
      <div data-testid="separator">{children}</div>
    ),
    useDefaultLayout: () => ({
      defaultLayout: undefined,
      onLayoutChange: vi.fn(),
    }),
  };
});

describe('NormalLayout', () => {
  it('collapses the terminal panel when the drawer closes', async () => {
    mocks.isDrawerOpen = true;
    const { rerender } = render(<NormalLayout />);

    expect(mocks.collapseTerminalPanel).not.toHaveBeenCalled();

    mocks.isDrawerOpen = false;
    rerender(<NormalLayout />);

    await waitFor(() => {
      expect(mocks.collapseTerminalPanel).toHaveBeenCalledTimes(1);
    });
  });
});
