/**
 * TauriAppGate — entry gate for Tauri builds.
 *
 * - No servers configured → navigate to /servers
 * - Has servers but not connected → auto-connect to last used, show spinner
 * - Connected → render children (the main App)
 * - /servers route is always reachable
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useServerManager } from '@/contexts/ServerManagerContext';

import '@/styles/legacy/index.css';

export function TauriAppGate({ children }: { children: ReactNode }) {
  const {
    servers,
    activeServerId,
    connectionStatus,
    connectionError,
    loading,
    connectToServer,
  } = useServerManager();
  const autoConnectAttempted = useRef(false);

  // Auto-connect to the most recently used server on startup
  useEffect(() => {
    if (loading || autoConnectAttempted.current) return;
    if (activeServerId) return; // already connected

    // Find the most recently connected server
    const sorted = [...servers].sort((a, b) => {
      const ta = a.lastConnectedAt ?? '';
      const tb = b.lastConnectedAt ?? '';
      return tb.localeCompare(ta);
    });

    if (sorted.length > 0) {
      autoConnectAttempted.current = true;
      connectToServer(sorted[0].id);
    }
  }, [loading, servers, activeServerId, connectToServer]);

  // Loading server list from storage
  if (loading) {
    return (
      <TauriGateShell>
        <p className="text-foreground opacity-60 animate-pulse text-center">
          Loading...
        </p>
      </TauriGateShell>
    );
  }

  // No servers configured → show server setup
  if (servers.length === 0) {
    // Lazy-import to avoid circular deps
    return <ServersPageLazy />;
  }

  // Connecting
  if (connectionStatus === 'connecting') {
    return (
      <TauriGateShell>
        <p className="text-foreground opacity-60 animate-pulse text-center">
          Connecting to server...
        </p>
      </TauriGateShell>
    );
  }

  // Connection error
  if (connectionStatus === 'error') {
    return <ServersPageLazy errorMessage={connectionError} />;
  }

  // Not connected and has servers → show servers page
  if (!activeServerId || connectionStatus !== 'connected') {
    return <ServersPageLazy />;
  }

  // Connected → render the main app
  return <>{children}</>;
}

function TauriGateShell({ children }: { children: ReactNode }) {
  return (
    <div className="legacy-design min-h-screen flex items-center justify-center bg-background">
      {children}
    </div>
  );
}

// Inline the Servers page to avoid circular route deps
import { Servers } from '@/pages/Servers';

function ServersPageLazy({ errorMessage }: { errorMessage?: string | null }) {
  return (
    <div className="legacy-design min-h-screen bg-background">
      <Servers errorMessage={errorMessage} />
    </div>
  );
}
