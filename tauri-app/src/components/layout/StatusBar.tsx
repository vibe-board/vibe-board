import { Wifi, WifiOff } from 'lucide-react';
import { useConnectionStore } from '@/lib/store/connectionStore';

export function StatusBar() {
  const { connectionStatus, activeServerId, servers } = useConnectionStore();
  const activeServer = servers.find((s) => s.id === activeServerId);

  return (
    <div className="flex h-6 items-center border-t border-border bg-surface-raised px-3 text-xs text-text-tertiary">
      <div className="flex items-center gap-2">
        {connectionStatus === 'connected' ? (
          <Wifi className="h-3 w-3 text-green-500" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        <span>
          {activeServer
            ? `${activeServer.name} — ${connectionStatus}`
            : 'No connection'}
        </span>
      </div>
    </div>
  );
}
