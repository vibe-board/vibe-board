// frontend/src/contexts/ConnectionContext.tsx
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { UnifiedConnection } from '@/lib/connections/types';
import { setActiveConnection } from '@/lib/gatewayMode';

const ConnectionContext = createContext<UnifiedConnection | null>(null);

interface ConnectionProviderProps {
  connection: UnifiedConnection;
  children: ReactNode;
}

export function ConnectionProvider({
  connection,
  children,
}: ConnectionProviderProps) {
  // Set module-level active connection so non-React code (api.ts) can access it
  useEffect(() => {
    setActiveConnection(connection);
    return () => {
      setActiveConnection(null);
    };
  }, [connection]);

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
