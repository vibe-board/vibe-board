import { useRef } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { useTerminalDrawer } from '@/contexts/TerminalDrawerContext';
import { TerminalPanel } from '@/components/panels/TerminalPanel';

function DirectTerminalPanel({
  workspaceId,
  cwd,
}: {
  workspaceId: string;
  cwd: string;
}) {
  return (
    <TerminalPanel
      workspaceId={workspaceId}
      taskId={workspaceId}
      cwd={cwd}
      buildEndpointUrl={(c) =>
        `/api/terminal/direct-ws?cwd=${encodeURIComponent(c)}`
      }
    />
  );
}

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const { isDrawerOpen, drawerCwd, drawerWorkspaceId } = useTerminalDrawer();

  const hasEverOpened = useRef(false);
  if (isDrawerOpen && drawerCwd) {
    hasEverOpened.current = true;
  }

  return (
    <>
      <div className="flex flex-col h-screen">
        <DevBanner />
        {!shouldHideNavbar && <Navbar />}
        <div className="flex-1 min-h-0 flex flex-row">
          <div className="flex-1 min-w-0 overflow-auto">
            <Outlet />
          </div>
          {/* Terminal drawer - always mounted once opened, hidden via CSS to preserve xterm state */}
          {hasEverOpened.current && drawerCwd && (
            <>
              <div
                className="shrink-0 bg-border"
                style={{ width: isDrawerOpen ? 1 : 0 }}
              />
              <div
                className="min-h-0 overflow-hidden"
                style={{
                  width: isDrawerOpen ? 'min(50vw, 640px)' : 0,
                  display: isDrawerOpen ? 'block' : 'none',
                }}
              >
                <DirectTerminalPanel
                  workspaceId={drawerWorkspaceId}
                  cwd={drawerCwd}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
