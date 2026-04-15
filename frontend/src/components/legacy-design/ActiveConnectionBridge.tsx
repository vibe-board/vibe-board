import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';

export function ActiveConnectionBridge({ children }: { children: ReactNode }) {
  const activeTabId = useConnectionStore((s) => s.activeTabId);
  const tabs = useConnectionStore((s) => s.tabs);
  const getConnection = useConnectionStore((s) => s.getConnection);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const conn = activeTab?.connectionId
    ? getConnection(activeTab.connectionId, activeTab.machineId)
    : null;

  if (!conn || conn.status !== 'connected') {
    return <>{children}</>;
  }

  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        {children}
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
