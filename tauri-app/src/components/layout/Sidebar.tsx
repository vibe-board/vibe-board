import { useNavigate, useParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  Server,
  Plus,
} from 'lucide-react';
import { useUIStore } from '@/lib/store/uiStore';
import { useConnectionStore } from '@/lib/store/connectionStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const navigate = useNavigate();
  useParams();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { servers, activeServerId, setActiveServer } = useConnectionStore();

  return (
    <div
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-surface-raised transition-all duration-200',
        sidebarCollapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3">
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold text-text-primary">
            Vibe Board
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Dashboard */}
          <button
            onClick={() => navigate('/')}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>Dashboard</span>}
          </button>

          {/* Servers */}
          {!sidebarCollapsed && (
            <div className="mt-4">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Servers
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => navigate('/settings')}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => {
                    setActiveServer(server.id);
                    navigate(`/servers/${server.id}/projects`);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm',
                    activeServerId === server.id
                      ? 'bg-surface-overlay text-text-primary'
                      : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
                  )}
                >
                  <Server className="h-4 w-4 shrink-0" />
                  <span className="truncate">{server.name}</span>
                  <div
                    className={cn(
                      'ml-auto h-2 w-2 rounded-full',
                      server.type === 'direct' ? 'bg-green-500' : 'bg-accent'
                    )}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="p-2">
        <button
          onClick={() => navigate('/settings')}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
            sidebarCollapsed && 'justify-center'
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>
      </div>
    </div>
  );
}
