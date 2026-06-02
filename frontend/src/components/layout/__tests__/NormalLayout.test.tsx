import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NormalLayout } from '../NormalLayout';
import type { TerminalDrawerController } from '@/contexts/TerminalContext';

interface MockPanelSize {
  asPercentage: number;
}

type MockLayout = { [id: string]: number };

const mocks = vi.hoisted(() => ({
  isDrawerOpen: false,
  setDrawerOpen: vi.fn(),
  registeredController: undefined as TerminalDrawerController | undefined,
  unregister: vi.fn(),
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
    setDrawerOpen: mocks.setDrawerOpen,
    registerDrawerController: (controller: TerminalDrawerController) => {
      mocks.registeredController = controller;
      return mocks.unregister;
    },
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
    mocks.setDrawerOpen.mockClear();
    mocks.registeredController = undefined;
    mocks.unregister.mockClear();
    mocks.collapseTerminalPanel.mockClear();
    mocks.resizeTerminalPanel.mockClear();
    mocks.isCollapsedTerminalPanel.mockReset();
    mocks.isCollapsedTerminalPanel.mockReturnValue(true);
    mocks.persistedLayout = undefined;
    mocks.capturedDefaultLayout = undefined;
    mocks.capturedTerminalOnResize = undefined;
  });

  it('registers a drawer controller on mount and unregisters on unmount', () => {
    const { unmount } = render(<NormalLayout />);

    expect(mocks.registeredController).toBeDefined();
    expect(typeof mocks.registeredController?.open).toBe('function');
    expect(typeof mocks.registeredController?.close).toBe('function');

    unmount();
    expect(mocks.unregister).toHaveBeenCalledTimes(1);
  });

  // Regression: the controller's close() must collapse the panel imperatively,
  // independent of isDrawerOpen. The old bug was that closing went through
  // state, so when isDrawerOpen was already false (desynced) the panel never
  // collapsed and the button appeared dead.
  it('collapses the terminal panel when the controller close() is invoked', () => {
    mocks.isDrawerOpen = false;
    render(<NormalLayout />);

    act(() => {
      mocks.registeredController?.close();
    });

    expect(mocks.collapseTerminalPanel).toHaveBeenCalledTimes(1);
  });

  it('resizes the terminal panel to the default when open() is invoked while collapsed', () => {
    mocks.isCollapsedTerminalPanel.mockReturnValue(true);
    render(<NormalLayout />);

    act(() => {
      mocks.registeredController?.open();
    });

    expect(mocks.resizeTerminalPanel).toHaveBeenCalledTimes(1);
    expect(mocks.resizeTerminalPanel).toHaveBeenCalledWith(30);
  });

  it('preserves a user-dragged size by skipping resize when open() is invoked while already expanded', () => {
    mocks.isCollapsedTerminalPanel.mockReturnValue(false);
    render(<NormalLayout />);

    act(() => {
      mocks.registeredController?.open();
    });

    expect(mocks.resizeTerminalPanel).not.toHaveBeenCalled();
  });

  it('mirrors panel visibility into isDrawerOpen via onResize', () => {
    render(<NormalLayout />);

    expect(mocks.capturedTerminalOnResize).toBeDefined();

    act(() => {
      mocks.capturedTerminalOnResize?.({ asPercentage: 25 });
    });
    expect(mocks.setDrawerOpen).toHaveBeenLastCalledWith(true);

    act(() => {
      mocks.capturedTerminalOnResize?.({ asPercentage: 0 });
    });
    expect(mocks.setDrawerOpen).toHaveBeenLastCalledWith(false);
  });

  it('forces the initial layout to a collapsed terminal when the drawer is closed at mount', () => {
    mocks.isDrawerOpen = false;
    mocks.persistedLayout = { content: 70, terminal: 30 };
    render(<NormalLayout />);

    // Without this override, the persisted [70, 30] from a previous session
    // would briefly show the terminal at 30% before it settles to collapsed.
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
});
