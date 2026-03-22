import { useAppStore, useConnectionStore } from '@/stores';
import { Button, StatusDot } from '@/components/ui';

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  'project-detail': 'Project',
  tasks: 'Tasks',
  'task-detail': 'Task',
  settings: 'Settings',
  servers: 'Servers',
};

export function Header() {
  const { currentView, commandPaletteOpen, setCommandPaletteOpen } = useAppStore();
  const { activeServerId, statuses } = useConnectionStore();
  const status = activeServerId ? statuses[activeServerId] : null;

  return (
    <header className="flex items-center justify-between h-11 px-4 border-b border-border bg-bg-secondary">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-text-primary">
          {viewTitles[currentView] ?? 'Vibe Board'}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Connection status */}
        {activeServerId && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-tertiary text-xs text-text-secondary">
            <StatusDot status={status?.connected ? 'online' : 'offline'} />
            <span>{status?.connected ? 'Connected' : 'Disconnected'}</span>
            {status?.latency && <span className="text-text-disabled">({status.latency}ms)</span>}
          </div>
        )}

        {/* Command palette trigger */}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCommandPaletteOpen(!commandPaletteOpen)}
          className="gap-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-text-disabled hidden sm:inline">
            <kbd className="kbd">Ctrl</kbd>
            <span className="mx-0.5 text-text-disabled">+</span>
            <kbd className="kbd">K</kbd>
          </span>
        </Button>
      </div>
    </header>
  );
}
