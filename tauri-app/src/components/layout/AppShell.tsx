import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';
import { useUIStore } from '@/lib/store/uiStore';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <div className="flex h-screen flex-col bg-surface">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div
          className={cn(
            'flex flex-1 flex-col overflow-hidden transition-all duration-200',
            sidebarCollapsed ? 'ml-14' : 'ml-60'
          )}
        >
          <TopBar />
          <main className="flex-1 overflow-auto p-4">{children}</main>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
