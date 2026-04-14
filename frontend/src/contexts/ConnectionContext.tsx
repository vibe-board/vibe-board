// frontend/src/contexts/ConnectionContext.tsx
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { UnifiedConnection } from '@/lib/connections/types';
import { setActiveConnection } from '@/lib/gatewayMode';

const ConnectionContext = createContext<UnifiedConnection | null>(null);

interface ConnectionProviderProps {
  connection: UnifiedConnection;
  /** When true this tab is visible — its connection becomes the global active one */
  active?: boolean;
  children: ReactNode;
}

export function ConnectionProvider({
  connection,
  active = true,
  children,
}: ConnectionProviderProps) {
  // Set module-level active connection synchronously so child components
  // see it on their very first render/effect (useEffect runs child-first,
  // which would cause children to see null if we set it in a parent effect).
  // Only the visible (active) tab should claim the global singleton.
  if (active) {
    setActiveConnection(connection);
  }

  // When this tab becomes active, claim the global connection
  useEffect(() => {
    if (active) {
      setActiveConnection(connection);
    }
    return () => {
      // Only clear if we're still the active connection (avoid clearing
      // another tab's connection when this tab unmounts)
      setActiveConnection((prev) => (prev === connection ? null : prev));
    };
  }, [connection, active]);

  return (
    <ConnectionContext.Provider value={connection}>
      {children}
    </ConnectionContext.Provider>
  );
}

/**
 * Get the active UnifiedConnection for the current tab.
 * All API calls should use conn.fetch() and conn.openWs() from this hook.
 */
export function useConnection(): UnifiedConnection {
  const ctx = useContext(ConnectionContext);
  if (!ctx)
    throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}

/**
 * Optional: get connection or null (for components that may render outside a connection context).
 */
export function useOptionalConnection(): UnifiedConnection | null {
  return useContext(ConnectionContext);
}
