import { useRef } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { useTerminal } from '@/contexts/TerminalContext';
import { TerminalBottomDrawer } from '@/components/layout/TerminalBottomDrawer';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const { isDrawerOpen } = useTerminal();

  const hasEverOpened = useRef(false);
  if (isDrawerOpen) {
    hasEverOpened.current = true;
  }

  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    groupId: 'normalLayout-terminal',
    storage: localStorage,
  });

  return (
    <div className="flex flex-col h-full">
      <DevBanner />
      <div className="flex-1 min-h-0">
        <Group
          orientation="vertical"
          className="h-full"
          defaultLayout={defaultLayout}
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

          {hasEverOpened.current && (
            <>
              <Separator
                id="terminal-handle"
                className="h-1 bg-border cursor-row-resize hover:bg-accent transition-colors"
              />
              <Panel
                id="terminal"
                defaultSize={isDrawerOpen ? 30 : 0}
                minSize={isDrawerOpen ? 15 : 0}
                collapsible
                collapsedSize={0}
                className="min-h-0"
                style={{ display: isDrawerOpen ? undefined : 'none' }}
              >
                <TerminalBottomDrawer />
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
  );
}
