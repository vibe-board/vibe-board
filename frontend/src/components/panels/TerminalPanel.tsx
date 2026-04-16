import { useTerminal } from '@/contexts/TerminalContext';
import type { TerminalTabContext } from '@/contexts/TerminalContext';
import { TerminalTabBar } from './TerminalTabBar';
import { XTermInstance } from './XTermInstance';

export interface NewTabOption {
  label: string;
  context: TerminalTabContext;
  workspaceId: string;
  taskId: string;
  cwd: string;
  disabled?: boolean;
}

interface TerminalPanelProps {
  newTabOptions: NewTabOption[];
}

function buildEndpointUrl(
  context: TerminalTabContext,
  cwd: string,
  workspaceId: string
): string {
  if (context.type === 'task') {
    return `/api/terminal/ws?workspace_id=${workspaceId}`;
  }
  return `/api/terminal/direct-ws?cwd=${encodeURIComponent(cwd)}`;
}

export function TerminalPanel({ newTabOptions }: TerminalPanelProps) {
  const {
    getAllTabs,
    getActiveGlobalTab,
    setActiveGlobalTab,
    createTab,
    closeTab,
    setSessionId,
  } = useTerminal();

  const tabs = getAllTabs();
  const activeTab = getActiveGlobalTab();

  const handleNewTab = (option: NewTabOption) => {
    createTab(option.workspaceId, option.taskId, option.cwd, option.context);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-secondary">
      <TerminalTabBar
        tabs={tabs}
        activeTabId={activeTab?.id ?? null}
        onTabSelect={(tabId) => setActiveGlobalTab(tabId)}
        onTabClose={(tabId) => {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) closeTab(tab.workspaceId, tabId);
        }}
        newTabOptions={newTabOptions}
        onNewTab={handleNewTab}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {tabs.map((tab) => {
          const endpointUrl = buildEndpointUrl(
            tab.context,
            tab.cwd,
            tab.workspaceId
          );
          return (
            <XTermInstance
              key={tab.id}
              endpointUrl={endpointUrl}
              isActive={tab.id === activeTab?.id}
              onClose={() => closeTab(tab.workspaceId, tab.id)}
              sessionId={tab.sessionId}
              onSessionId={(sid) => setSessionId(tab.workspaceId, tab.id, sid)}
            />
          );
        })}
      </div>
    </div>
  );
}
