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

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const { isDrawerOpen, openDrawer, closeDrawer } = useTerminal();
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);
  const isDrawerOpenRef = useRef(isDrawerOpen);
  isDrawerOpenRef.current = isDrawerOpen;

  useEffect(() => {
    const terminalPanel = terminalPanelRef.current;
    if (!terminalPanel) return;

    const frameId = requestAnimationFrame(() => {
      if (isDrawerOpen) {
        // Only resize to the default 30% when the panel is currently collapsed.
        // If the panel is already at a non-zero size (e.g. user dragged it open
        // or auto-sync flipped isDrawerOpen via onResize), preserve that size.
        if (terminalPanel.isCollapsed?.() ?? true) {
          terminalPanel.resize(30);
        }
      } else {
        terminalPanel.collapse();
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [isDrawerOpen]);

  const { defaultLayout: persistedLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'normalLayout-terminal',
    storage: localStorage,
  });

  // Captured at mount: when the drawer is closed at mount, force the terminal
  // panel to 0 in the initial layout. Otherwise the persisted layout (saved by
  // another tab while its drawer was open) would render the terminal at its
  // old size before useEffect's collapse() runs, leaving the panel visually
  // open while isDrawerOpen=false.
  const [initialDefaultLayout] = useState<Layout | undefined>(() => {
    if (!persistedLayout) return undefined;
    return isDrawerOpen ? persistedLayout : { content: 100, terminal: 0 };
  });

  // Auto-sync isDrawerOpen with the actual terminal panel visibility. Without
  // this, the state can desync (e.g. user drags the separator to open the
  // panel) and the ↓ collapse button becomes a no-op because closeDrawer()
  // sets isDrawerOpen=false but the value didn't change, so the useEffect
  // never re-runs to call terminalPanel.collapse().
  const handleTerminalResize = useCallback(
    (size: PanelSize) => {
      const isVisible = size.asPercentage > 0;
      if (isVisible !== isDrawerOpenRef.current) {
        if (isVisible) openDrawer();
        else closeDrawer();
      }
    },
    [openDrawer, closeDrawer]
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
            defaultSize={isDrawerOpen ? 30 : 0}
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
