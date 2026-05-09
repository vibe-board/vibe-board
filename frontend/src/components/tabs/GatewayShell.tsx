// frontend/src/components/tabs/GatewayShell.tsx
import { useEffect } from 'react';
import { GATEWAY_SELF_ID, useConnectionStore } from '@/stores/connection-store';
import { TabBar } from './TabBar';
import { GatewayHomeTab } from './GatewayHomeTab';
import { GatewayLoginScreen } from './GatewayLoginScreen';
import { ProjectTab } from './ProjectTab';
import { MachineProjectsTab } from './MachineProjectsTab';

export function GatewayShell() {
  const { initialized, init, tabs, activeTabId, closeTab, setActiveTab } =
    useConnectionStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx === 0) setActiveTab('home');
        else {
          const tab = tabs[idx - 1];
          if (tab) setActiveTab(tab.id);
        }
      }
      if (e.ctrlKey && e.key === 'w') {
        if (activeTabId !== 'home') {
          e.preventDefault();
          closeTab(activeTabId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, setActiveTab, closeTab]);

  const sessionExists = useConnectionStore(
    (s) =>
      !!s.nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)?.gatewayState
        ?.session
  );

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!sessionExists) {
    return <GatewayLoginScreen connectionId={GATEWAY_SELF_ID} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        <div
          className={`h-full overflow-auto ${
            activeTabId === 'home' ? '' : 'hidden'
          }`}
        >
          <GatewayHomeTab connectionId={GATEWAY_SELF_ID} />
        </div>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${
              activeTabId === tab.id ? '' : 'hidden'
            }`}
          >
            {tab.type === 'machine-projects' ? (
              <MachineProjectsTab tab={tab} />
            ) : (
              <ProjectTab tab={tab} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
