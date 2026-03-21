import { Show, type Component } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { cn } from '@/lib/cn';
import { useUIStore } from '@/stores/ui';
import { Search, Command } from 'lucide-solid';
import { Kbd } from '@/components/ui/kbd';
import { ConnectionStatus } from '@/components/connection/connection-status';

export const HeaderBar: Component = () => {
  const location = useLocation();
  const { setCommandPaletteOpen } = useUIStore();

  const breadcrumb = () => {
    const path = location.pathname;
    if (path === '/') return 'Home';
    if (path === '/projects') return 'Projects';
    if (path.startsWith('/projects/')) return 'Project';
    if (path === '/settings') return 'Settings';
    if (path === '/connect') return 'Connections';
    return '';
  };

  return (
    <header class="flex items-center justify-between h-11 px-4 border-b border-border bg-surface shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-foreground">{breadcrumb()}</span>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-2 h-7 px-2.5 rounded-md border border-border bg-background text-xs text-muted hover:text-foreground hover:border-border-strong transition-colors"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Search class="h-3 w-3" />
          <span>Search...</span>
          <div class="flex items-center gap-0.5">
            <Kbd>&#8984;</Kbd>
            <Kbd>K</Kbd>
          </div>
        </button>
        <ConnectionStatus />
      </div>
    </header>
  );
};
