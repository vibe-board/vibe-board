import { useEffect, useRef } from 'react';
import { useTerminal } from '@/contexts/TerminalContext';
import { TerminalTabBar } from './TerminalTabBar';
import { XTermInstance } from './XTermInstance';

interface TerminalPanelProps {
  workspaceId: string;
  taskId: string;
  cwd: string | null;
  /** Build the base endpoint URL for a terminal tab.
   *  If not provided, defaults to workspace-based endpoint.
   */
  buildEndpointUrl?: (cwd: string) => string;
}

export function TerminalPanel({
  workspaceId,
  taskId,
  cwd,
  buildEndpointUrl,
}: TerminalPanelProps) {
  const {
    getTabsForWorkspace,
    getActiveTab,
    createTab,
    closeTab,
    setActiveTab,
    clearWorkspaceTabs,
    setSessionId,
    isWorkspaceClosed,
  } = useTerminal();

  const tabs = getTabsForWorkspace(workspaceId);
  const activeTab = getActiveTab(workspaceId);

  const creatingRef = useRef(false);
  const prevWorkspaceIdRef = useRef<string | null>(null);

  // Clean up terminals when workspace changes
  useEffect(() => {
    if (
      prevWorkspaceIdRef.current &&
      prevWorkspaceIdRef.current !== workspaceId
    ) {
      clearWorkspaceTabs(prevWorkspaceIdRef.current);
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, clearWorkspaceTabs]);

  // Auto-create first tab when workspace is selected and terminal mode is active.
  // Skip if the user explicitly closed all terminals for this workspace.
  useEffect(() => {
    if (
      workspaceId &&
      cwd &&
      tabs.length === 0 &&
      !creatingRef.current &&
      !isWorkspaceClosed(workspaceId)
    ) {
      creatingRef.current = true;
      createTab(workspaceId, taskId, cwd);
    }
    if (tabs.length > 0) {
      creatingRef.current = false;
    }
  }, [workspaceId, taskId, cwd, tabs.length, createTab, isWorkspaceClosed]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-secondary">
      <TerminalTabBar
        tabs={tabs}
        activeTabId={activeTab?.id ?? null}
        onTabSelect={(tabId) => setActiveTab(workspaceId, tabId)}
        onTabClose={(tabId) => closeTab(workspaceId, tabId)}
        onNewTab={() => cwd && createTab(workspaceId, taskId, cwd)}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {tabs.map((tab) => {
          const endpointUrl = buildEndpointUrl
            ? buildEndpointUrl(tab.cwd)
            : `/api/terminal/ws?workspace_id=${workspaceId}`;
          return (
            <XTermInstance
              key={tab.id}
              endpointUrl={endpointUrl}
              isActive={tab.id === activeTab?.id}
              onClose={() => closeTab(workspaceId, tab.id)}
              sessionId={tab.sessionId}
              onSessionId={(sid) => setSessionId(workspaceId, tab.id, sid)}
            />
          );
        })}
      </div>
    </div>
  );
}
