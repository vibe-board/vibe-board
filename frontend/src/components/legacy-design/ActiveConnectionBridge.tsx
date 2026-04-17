import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { useConnectionStore } from '@/stores/connection-store';
import { isLocalDirect } from '@/lib/isLocalDirect';
import { LocalConnection } from '@/lib/connections/localConnection';

export function ActiveConnectionBridge({ children }: { children: ReactNode }) {
  // In local-direct mode, always provide the LocalConnection singleton.
  // No status check — the instance + queryClient exist immediately.
  // LocalDirectShell handles the loading/error UI before rendering App.
  if (isLocalDirect) {
    const conn = LocalConnection.getInstance();
    return (
      <ConnectionProvider connection={conn}>
        <QueryClientProvider client={conn.queryClient}>
          {children}
        </QueryClientProvider>
      </ConnectionProvider>
    );
  }

  // Multi-connection mode: bridge from connection store
  return <MultiConnectionBridge>{children}</MultiConnectionBridge>;
}

function MultiConnectionBridge({ children }: { children: ReactNode }) {
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
