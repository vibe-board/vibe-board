import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NormalLayout } from '../NormalLayout';

interface MockPanelSize {
  asPercentage: number;
}

type MockLayout = { [id: string]: number };

const mocks = vi.hoisted(() => ({
  isDrawerOpen: false,
  openDrawer: vi.fn(),
  closeDrawer: vi.fn(),
  collapseTerminalPanel: vi.fn(),
  resizeTerminalPanel: vi.fn(),
  isCollapsedTerminalPanel: vi.fn(() => true),
  persistedLayout: undefined as { [id: string]: number } | undefined,
  capturedDefaultLayout: undefined as { [id: string]: number } | undefined,
  capturedTerminalOnResize: undefined as
    | ((size: MockPanelSize) => void)
    | undefined,
}));

vi.mock('@/contexts/TerminalContext', () => ({
  useTerminal: () => ({
    isDrawerOpen: mocks.isDrawerOpen,
    openDrawer: mocks.openDrawer,
    closeDrawer: mocks.closeDrawer,
  }),
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
  type PanelImperative = {
    collapse: () => void;
    resize: (size: number) => void;
    isCollapsed: () => boolean;
  };

  const Panel = React.forwardRef<
    PanelImperative,
    React.PropsWithChildren<{
      id?: string;
      panelRef?: React.Ref<PanelImperative>;
      onResize?: (size: MockPanelSize) => void;
    }>
  >(function MockPanel({ children, id, panelRef, onResize }, _ref) {
    React.useImperativeHandle(panelRef, () => ({
      collapse: id === 'terminal' ? mocks.collapseTerminalPanel : vi.fn(),
      resize: id === 'terminal' ? mocks.resizeTerminalPanel : vi.fn(),
      isCollapsed:
        id === 'terminal' ? mocks.isCollapsedTerminalPanel : () => false,
    }));

    if (id === 'terminal') {
      mocks.capturedTerminalOnResize = onResize;
    }

    return <div data-testid={`panel-${id}`}>{children}</div>;
  });

  return {
    Group: ({
      children,
      defaultLayout,
    }: React.PropsWithChildren<{ defaultLayout?: MockLayout }>) => {
      mocks.capturedDefaultLayout = defaultLayout;
      return <div data-testid="panel-group">{children}</div>;
    },
    Panel,
    Separator: ({ children }: React.PropsWithChildren) => (
      <div data-testid="separator">{children}</div>
    ),
    useDefaultLayout: () => ({
      defaultLayout: mocks.persistedLayout,
      onLayoutChange: vi.fn(),
    }),
  };
});

describe('NormalLayout', () => {
  beforeEach(() => {
    mocks.isDrawerOpen = false;
    mocks.openDrawer.mockClear();
    mocks.closeDrawer.mockClear();
    mocks.collapseTerminalPanel.mockClear();
    mocks.resizeTerminalPanel.mockClear();
    mocks.isCollapsedTerminalPanel.mockReset();
    mocks.isCollapsedTerminalPanel.mockReturnValue(true);
    mocks.persistedLayout = undefined;
    mocks.capturedDefaultLayout = undefined;
    mocks.capturedTerminalOnResize = undefined;
  });

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

  it('forces the initial layout to a collapsed terminal when the drawer is closed at mount', () => {
    mocks.isDrawerOpen = false;
    mocks.persistedLayout = { content: 70, terminal: 30 };
    render(<NormalLayout />);

    // Without this override, the persisted [70, 30] from another tab would
    // briefly show the terminal at 30% before useEffect collapses it.
    expect(mocks.capturedDefaultLayout).toEqual({ content: 100, terminal: 0 });
  });

  it('uses the persisted layout when the drawer is open at mount', () => {
    mocks.isDrawerOpen = true;
    mocks.persistedLayout = { content: 60, terminal: 40 };
    render(<NormalLayout />);

    expect(mocks.capturedDefaultLayout).toEqual({ content: 60, terminal: 40 });
  });

  it('passes through undefined defaultLayout when nothing is persisted', () => {
    mocks.isDrawerOpen = false;
    mocks.persistedLayout = undefined;
    render(<NormalLayout />);

    expect(mocks.capturedDefaultLayout).toBeUndefined();
  });

  it('opens the drawer when the terminal panel becomes visible', () => {
    mocks.isDrawerOpen = false;
    render(<NormalLayout />);

    expect(mocks.capturedTerminalOnResize).toBeDefined();
    act(() => {
      mocks.capturedTerminalOnResize?.({ asPercentage: 25 });
    });

    expect(mocks.openDrawer).toHaveBeenCalledTimes(1);
    expect(mocks.closeDrawer).not.toHaveBeenCalled();
  });

  it('closes the drawer when the terminal panel collapses to zero', () => {
    mocks.isDrawerOpen = true;
    render(<NormalLayout />);

    act(() => {
      mocks.capturedTerminalOnResize?.({ asPercentage: 0 });
    });

    expect(mocks.closeDrawer).toHaveBeenCalledTimes(1);
    expect(mocks.openDrawer).not.toHaveBeenCalled();
  });

  it('does not toggle the drawer when terminal size already matches state', () => {
    mocks.isDrawerOpen = true;
    render(<NormalLayout />);

    act(() => {
      mocks.capturedTerminalOnResize?.({ asPercentage: 30 });
    });

    expect(mocks.openDrawer).not.toHaveBeenCalled();
    expect(mocks.closeDrawer).not.toHaveBeenCalled();
  });

  it('preserves the user-set panel size by skipping resize when not collapsed', async () => {
    mocks.isDrawerOpen = false;
    mocks.isCollapsedTerminalPanel.mockReturnValue(false);
    const { rerender } = render(<NormalLayout />);

    mocks.isDrawerOpen = true;
    rerender(<NormalLayout />);

    // Wait a frame for the requestAnimationFrame in the effect to fire.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(mocks.resizeTerminalPanel).not.toHaveBeenCalled();
  });
});
