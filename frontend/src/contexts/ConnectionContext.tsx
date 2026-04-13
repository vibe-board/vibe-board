// frontend/src/contexts/ConnectionContext.tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { UnifiedConnection } from '@/lib/connections/types';

const ConnectionContext = createContext<UnifiedConnection | null>(null);

interface ConnectionProviderProps {
  connection: UnifiedConnection;
  children: ReactNode;
}

export function ConnectionProvider({ connection, children }: ConnectionProviderProps) {
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
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}

/**
 * Optional: get connection or null (for components that may render outside a connection context).
 */
export function useOptionalConnection(): UnifiedConnection | null {
  return useContext(ConnectionContext);
}
