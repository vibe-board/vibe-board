// frontend/src/components/tabs/ProjectTab.tsx
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';
import type { TabPersisted } from '@/lib/connections/types';
import App from '@/App';

export function ProjectTab({ tab }: { tab: TabPersisted }) {
  const getConnection = useConnectionStore((s) => s.getConnection);
  const conn = tab.connectionId
    ? getConnection(tab.connectionId, tab.machineId)
    : null;

  // Subscribe to connection status changes to re-render on reconnect
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    return conn.onStatusChange(() => setTick((t) => t + 1));
  }, [conn]);

  if (!conn) {
    return (
      <div className="flex items-center justify-center h-full text-foreground/50 text-sm">
        Connection not found. The connection may have been removed.
      </div>
    );
  }

  if (conn.status === 'connecting' || conn.status === 'reconnecting') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-foreground/60 text-sm animate-pulse">
            {conn.status === 'reconnecting'
              ? conn.error || 'Reconnecting...'
              : 'Connecting...'}
          </p>
        </div>
      </div>
    );
  }

  if (conn.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-destructive text-sm">
            {conn.error || 'Connection error'}
          </p>
          <button
            className="px-3 py-1 text-xs bg-foreground text-background rounded hover:opacity-85"
            onClick={() => conn.connect().catch(() => {})}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (conn.status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full text-foreground/50 text-sm">
        Not connected
      </div>
    );
  }

  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <App />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
