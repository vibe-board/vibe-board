import { useAppStore, useConnectionStore } from '@/stores';
import { StatusDot, Tooltip } from '@/components/ui';
import { twMerge } from 'tailwind-merge';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: HomeIcon, view: 'dashboard' as const },
  { id: 'projects', label: 'Projects', icon: FolderIcon, view: 'projects' as const },
  { id: 'tasks', label: 'Tasks', icon: CheckSquareIcon, view: 'tasks' as const },
  { id: 'servers', label: 'Servers', icon: ServerIcon, view: 'servers' as const },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, view: 'settings' as const },
];

export function Sidebar() {
  const { currentView, setView, sidebarCollapsed } = useAppStore();
  const { servers, statuses, activeServerId, setActiveServer } = useConnectionStore();

  return (
    <aside
      className={twMerge(
        'flex flex-col bg-bg-secondary border-r border-border h-full transition-all duration-150',
        sidebarCollapsed ? 'w-14' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-border">
        <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          V
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold text-text-primary truncate">Vibe Board</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-1.5 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = currentView === item.view;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.view)}
              className={twMerge(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors duration-100 w-full text-left',
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
              )}
            >
              <item.icon size={16} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Server list */}
      {!sidebarCollapsed && servers.length > 0 && (
        <div className="border-t border-border py-2 px-1.5">
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-text-disabled font-medium">
            Servers
          </div>
          {servers.map((server) => {
            const status = statuses[server.id];
            const active = activeServerId === server.id;
            return (
              <button
                key={server.id}
                onClick={() => setActiveServer(server.id)}
                className={twMerge(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded text-sm w-full text-left transition-colors duration-100',
                  active
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-tertiary hover:bg-bg-hover hover:text-text-secondary',
                )}
              >
                <StatusDot status={status?.connected ? 'online' : 'offline'} />
                <span className="truncate">{server.name}</span>
                {server.mode === 'gateway' && (
                  <span className="text-[10px] text-text-disabled ml-auto">GW</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

// Minimal inline icons using SVG

function HomeIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function FolderIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
    </svg>
  );
}

function CheckSquareIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function ServerIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function SettingsIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
