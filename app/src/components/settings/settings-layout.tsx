import { For, type Component, type JSX } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { cn } from '@/lib/cn';

const tabs = [
  { path: '/settings', label: 'General' },
  { path: '/settings/servers', label: 'Servers' },
  { path: '/settings/agents', label: 'Agents' },
  { path: '/settings/repos', label: 'Repositories' },
  { path: '/settings/e2ee', label: 'E2EE' },
];

export const SettingsLayout: Component<{ children: JSX.Element }> = (
  props,
) => {
  const location = useLocation();

  return (
    <div class="flex h-full">
      <nav class="w-48 p-3 border-r border-border shrink-0">
        <For each={tabs}>
          {(tab) => (
            <A
              href={tab.path}
              class={cn(
                'block px-3 py-1.5 rounded-md text-sm transition-colors',
                location.pathname === tab.path
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-muted hover:text-foreground hover:bg-surface-2',
              )}
            >
              {tab.label}
            </A>
          )}
        </For>
      </nav>
      <div class="flex-1 p-6 overflow-y-auto">{props.children}</div>
    </div>
  );
};
