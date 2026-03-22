import { useEffect } from 'react';
import { useAppStore, useConnectionStore } from '@/stores';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { DashboardPage } from '@/components/pages/DashboardPage';
import { ProjectsPage } from '@/components/pages/ProjectsPage';
import { TasksPage } from '@/components/pages/TasksPage';
import { ServersPage } from '@/components/pages/ServersPage';
import { SettingsPage } from '@/components/pages/SettingsPage';

export function MainLayout() {
  const { currentView } = useAppStore();
  const { loadPersisted } = useConnectionStore();

  useEffect(() => {
    loadPersisted();
  }, [loadPersisted]);

  function renderPage() {
    switch (currentView) {
      case 'dashboard':
        return <DashboardPage />;
      case 'projects':
        return <ProjectsPage />;
      case 'tasks':
        return <TasksPage />;
      case 'servers':
        return <ServersPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
