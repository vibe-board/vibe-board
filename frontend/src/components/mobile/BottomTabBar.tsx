import { Link, useLocation } from 'react-router-dom';
import { FolderOpen, ListTodo, Server, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/platform';

interface Tab {
  label: string;
  icon: typeof FolderOpen;
  to: string;
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  {
    label: 'Projects',
    icon: FolderOpen,
    to: '/local-projects',
    match: (p) => p === '/' || p.startsWith('/local-projects'),
  },
  {
    label: 'Tasks',
    icon: ListTodo,
    to: '/local-projects',
    match: (p) => /\/local-projects\/[^/]+\/tasks/.test(p),
  },
  ...(isTauri()
    ? [
        {
          label: 'Servers',
          icon: Server,
          to: '/servers',
          match: (p: string) => p === '/servers',
        },
      ]
    : []),
  {
    label: 'Settings',
    icon: Settings,
    to: '/settings',
    match: (p) => p.startsWith('/settings'),
  },
];

export function BottomTabBar() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const active = tab.match(location.pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              to={tab.to}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-xs',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
