import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';
import { GatewayMachineConnection } from '@/lib/connections/gatewayConnection';
import type { TabPersisted } from '@/lib/connections/types';
import { ProjectListView } from './ProjectListView';

export function MachineProjectsTab({ tab }: { tab: TabPersisted }) {
  const getConnection = useConnectionStore((s) => s.getConnection);
  const { openProjectTab } = useConnectionStore();
  const conn = tab.connectionId
    ? getConnection(tab.connectionId, tab.machineId)
    : null;

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    return conn.onStatusChange(() => setTick((t) => t + 1));
  }, [conn]);

  useEffect(() => {
    if (!conn || !(conn instanceof GatewayMachineConnection)) return;
    conn.addRef();
    return () => conn.removeRef();
  }, [conn]);

  useEffect(() => {
    if (!conn) return;
    if (conn.status === 'disconnected' || conn.status === 'error') {
      conn.connect().catch(() => {});
    }
  }, [conn, conn?.status]);

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
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-foreground/60" />
          <p className="text-foreground/60 text-sm">
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
            className="px-3 py-1.5 text-sm bg-foreground text-background rounded hover:opacity-85"
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
        <ProjectListView
          subtitle={tab.label}
          onOpenProject={(project) => {
            if (!tab.connectionId) return;
            openProjectTab(
              tab.connectionId,
              tab.machineId,
              project.id,
              project.name
            );
          }}
        />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
