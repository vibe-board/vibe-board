// frontend/src/components/tabs/TabShell.tsx
import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { TabBar } from './TabBar';
import { HomeTab } from './HomeTab';
import { ProjectTab } from './ProjectTab';

export function TabShell() {
  const { initialized, init, tabs, activeTabId } = useConnectionStore();

  useEffect(() => {
    init();
  }, [init]);

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
        <div className={`h-full overflow-auto ${activeTabId === 'home' ? '' : 'hidden'}`}>
          <HomeTab />
        </div>

        {/* Project tabs — keep mounted to preserve state, hide inactive */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${activeTabId === tab.id ? '' : 'hidden'}`}
          >
            <ProjectTab tab={tab} />
          </div>
        ))}
      </div>
    </div>
  );
}
