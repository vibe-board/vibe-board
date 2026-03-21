import { type Component } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { SidebarNav } from './sidebar-nav';
import { HeaderBar } from './header-bar';
import { StatusBar } from './status-bar';
import { ToastContainer } from '@/components/ui/toast';
import { CommandPalette } from '@/components/ui/command-palette';
import { useUIStore } from '@/stores/ui';
import { cn } from '@/lib/cn';

export const AppShell: Component<{ children?: any }> = (props) => {
  const { sidebarCollapsed, commandPaletteOpen, setCommandPaletteOpen } = useUIStore();

  // Global keyboard shortcut for command palette
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    });
  }

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-background">
      <SidebarNav />
      <div class="flex flex-1 flex-col min-w-0">
        <HeaderBar />
        <main class="flex-1 overflow-auto">
          {props.children}
        </main>
        <StatusBar />
      </div>
      <CommandPalette
        open={commandPaletteOpen()}
        onOpenChange={setCommandPaletteOpen}
        items={[
          { id: 'new-task', label: 'Create New Task', description: 'Create a new task in the current project', action: () => {}, keywords: ['add', 'task'] },
          { id: 'switch-theme', label: 'Toggle Theme', description: 'Switch between light and dark mode', action: () => {}, keywords: ['dark', 'light'] },
          { id: 'settings', label: 'Open Settings', description: 'Go to application settings', action: () => {}, keywords: ['preferences', 'config'] },
        ]}
      />
      <ToastContainer />
    </div>
  );
};
