import { NavLink } from 'react-router-dom';
import { Folder, List, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/projects', label: 'Projects', icon: Folder },
  { path: '/tasks', label: 'Tasks', icon: List },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/settings', label: 'Settings', icon: Settings },
] as const;

export default function BottomTabBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background"
      style={{ paddingBottom: 'var(--sab)' }}
    >
      <div className="flex h-16 items-stretch">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-1',
                'min-h-[44px] text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <tab.icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
