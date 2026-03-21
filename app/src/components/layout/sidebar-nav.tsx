import { For, Show, createMemo, type Component } from 'solid-js';
import { A, useLocation, useNavigate } from '@solidjs/router';
import { cn } from '@/lib/cn';
import { useUIStore } from '@/stores/ui';
import { useConnection } from '@/stores/connections';
import { LayoutDashboard, FolderKanban, Settings, Plus, ChevronLeft, ChevronRight, Wifi, WifiOff, Server } from 'lucide-solid';

export const SidebarNav: Component = () => {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { state, activeServer, setActiveServer } = useConnection();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Home' },
    { path: '/projects', icon: FolderKanban, label: 'Projects' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside class={cn(
      'flex flex-col h-full border-r border-border bg-surface transition-all duration-200 shrink-0',
      sidebarCollapsed() ? 'w-12' : 'w-60',
    )}>
      {/* Server selector */}
      <div class={cn('flex items-center gap-2 p-2 border-b border-border', sidebarCollapsed() && 'justify-center')}>
        <Show when={!sidebarCollapsed()}>
          <button
            class="flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2 transition-colors truncate"
            onClick={() => navigate('/connect')}
          >
            <Server class="h-4 w-4 shrink-0 text-muted" />
            <span class="truncate">{activeServer()?.name ?? 'No Server'}</span>
          </button>
        </Show>
        <Show when={sidebarCollapsed()}>
          <button class="p-1 rounded-md hover:bg-surface-2" onClick={() => navigate('/connect')}>
            <Server class="h-4 w-4 text-muted" />
          </button>
        </Show>
      </div>

      {/* Navigation */}
      <nav class="flex-1 p-2 space-y-0.5 overflow-y-auto">
        <For each={navItems}>
          {(item) => {
            const isActive = () => location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <A
                href={item.path}
                class={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  isActive()
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface-2',
                  sidebarCollapsed() && 'justify-center px-0',
                )}
              >
                <item.icon class="h-4 w-4 shrink-0" />
                <Show when={!sidebarCollapsed()}>
                  <span>{item.label}</span>
                </Show>
              </A>
            );
          }}
        </For>

        <Show when={!sidebarCollapsed()}>
          <div class="pt-3 pb-1">
            <div class="flex items-center justify-between px-2.5">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-subtle">Servers</span>
              <button class="p-0.5 rounded hover:bg-surface-2" onClick={() => navigate('/connect')}>
                <Plus class="h-3.5 w-3.5 text-subtle" />
              </button>
            </div>
          </div>
          <For each={state.servers}>
            {(server) => (
              <button
                class={cn(
                  'flex items-center gap-2.5 w-full rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  server.id === state.activeServerId ? 'bg-surface-2 text-foreground' : 'text-muted hover:text-foreground hover:bg-surface-2',
                )}
                onClick={() => setActiveServer(server.id)}
              >
                {server.status === 'connected' ? <Wifi class="h-3.5 w-3.5 text-status-done shrink-0" /> : <WifiOff class="h-3.5 w-3.5 text-status-cancelled shrink-0" />}
                <span class="truncate">{server.name}</span>
              </button>
            )}
          </For>
        </Show>
      </nav>

      {/* Collapse toggle */}
      <div class="p-2 border-t border-border">
        <button
          class="flex items-center justify-center w-full rounded-md p-1.5 text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
          onClick={toggleSidebar}
        >
          <Show when={sidebarCollapsed()} fallback={<ChevronLeft class="h-4 w-4" />}>
            <ChevronRight class="h-4 w-4" />
          </Show>
        </button>
      </div>
    </aside>
  );
};
