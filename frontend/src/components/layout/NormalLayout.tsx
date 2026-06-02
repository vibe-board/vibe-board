import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type Layout,
  type PanelImperativeHandle,
  type PanelSize,
} from 'react-resizable-panels';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { useTerminal } from '@/contexts/TerminalContext';
import { TerminalBottomDrawer } from '@/components/layout/TerminalBottomDrawer';

/** Default terminal panel height (% of the vertical group) when opened. */
const DEFAULT_TERMINAL_SIZE = 30;

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const { isDrawerOpen, registerDrawerController, setDrawerOpen } =
    useTerminal();
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);

  // Register the physical panel as the single source of truth for the drawer.
  // Drawer commands (buttons) call these methods directly, so a command always
  // reaches the panel — it is never swallowed by `isDrawerOpen` already holding
  // the target value, which was the root of the "won't collapse" bug. The panel
  // then emits `onResize`, which mirrors visibility back into `isDrawerOpen`.
  // Commands flow one way (button → panel); state flows the other (panel →
  // mirror); the two never write the same value, so there is no feedback loop.
  useEffect(() => {
    return registerDrawerController({
      open: () => {
        const panel = terminalPanelRef.current;
        if (!panel) return;
        // Only snap to the default height when collapsed; preserve a size the
        // user dragged to.
        if (panel.isCollapsed?.() ?? true) {
          panel.resize(DEFAULT_TERMINAL_SIZE);
        }
      },
      close: () => {
        terminalPanelRef.current?.collapse();
      },
    });
  }, [registerDrawerController]);

  const { defaultLayout: persistedLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'normalLayout-terminal',
    storage: localStorage,
  });

  // Captured at mount: the drawer always starts closed (persisted state forces
  // isDrawerOpen=false on load), so force the terminal panel to 0 in the initial
  // layout. Otherwise a persisted layout saved while the drawer was open would
  // briefly render the terminal at its old size before it settles.
  const [initialDefaultLayout] = useState<Layout | undefined>(() => {
    if (!persistedLayout) return undefined;
    return isDrawerOpen ? persistedLayout : { content: 100, terminal: 0 };
  });

  // Mirror the panel's real visibility into isDrawerOpen. This is the ONLY
  // writer of the flag, so it can never disagree with what's on screen. The
  // reducer ignores no-op writes, so steady-state resizes don't re-render.
  const handleTerminalResize = useCallback(
    (size: PanelSize) => {
      setDrawerOpen(size.asPercentage > 0);
    },
    [setDrawerOpen]
  );

  return (
    <div className="flex flex-col h-full">
      <DevBanner />
      <div className="flex-1 min-h-0">
        <Group
          orientation="vertical"
          className="h-full"
          defaultLayout={initialDefaultLayout}
          onLayoutChange={onLayoutChange}
        >
          <Panel
            id="content"
            defaultSize={isDrawerOpen ? 70 : 100}
            minSize={30}
            className="min-h-0"
          >
            <div className="flex flex-col h-full">
              {!shouldHideNavbar && <Navbar />}
              <div className="flex-1 min-h-0 overflow-auto">
                <Outlet />
              </div>
            </div>
          </Panel>

          <Separator
            id="terminal-handle"
            className="h-1 bg-border cursor-row-resize hover:bg-accent transition-colors"
          />
          <Panel
            id="terminal"
            panelRef={terminalPanelRef}
            defaultSize={isDrawerOpen ? DEFAULT_TERMINAL_SIZE : 0}
            minSize={15}
            collapsible
            collapsedSize={0}
            onResize={handleTerminalResize}
            className="min-h-0"
          >
            <TerminalBottomDrawer />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
