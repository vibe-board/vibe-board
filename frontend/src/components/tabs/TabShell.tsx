// frontend/src/components/tabs/TabShell.tsx
import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { TabBar } from './TabBar';
import { HomeTab } from './HomeTab';
import { ProjectTab } from './ProjectTab';
import { MachineProjectsTab } from './MachineProjectsTab';

export function TabShell() {
  const { initialized, init, tabs, activeTabId, closeTab, setActiveTab } =
    useConnectionStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+1~9: switch to tab by position
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx === 0) {
          setActiveTab('home');
        } else {
          const tab = tabs[idx - 1];
          if (tab) setActiveTab(tab.id);
        }
      }

      // Ctrl+W: close active tab
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

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        {/* Home tab */}
        <div
          className={`h-full overflow-auto ${activeTabId === 'home' ? '' : 'hidden'}`}
        >
          <HomeTab />
        </div>

        {/* All tabs — keep mounted to preserve state, hide inactive */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${activeTabId === tab.id ? '' : 'hidden'}`}
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
