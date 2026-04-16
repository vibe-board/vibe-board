import { useEffect, useRef, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { LocalConnection } from '@/lib/connections/localConnection';
import App from '@/App';

export function LocalDirectShell() {
  const connRef = useRef<LocalConnection | null>(null);
  if (!connRef.current) {
    connRef.current = new LocalConnection();
  }
  const conn = connRef.current;

  const [status, setStatus] = useState(conn.status);
  const [error, setError] = useState(conn.error);

  // Subscribe to connection status
  useEffect(() => {
    return conn.onStatusChange((s, e) => {
      setStatus(s);
      setError(e);
    });
  }, [conn]);

  // Auto-connect on mount
  useEffect(() => {
    if (conn.status === 'disconnected') {
      conn.connect().catch(() => {});
    }
  }, [conn]);

  // Loading state
  if (status === 'connecting') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-2">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-foreground/60" />
          <p className="text-foreground/50 text-sm">
            Connecting to local server...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3">
          <p className="text-destructive text-sm">
            {error || 'Connection failed'}
          </p>
          <button
            className="px-4 py-2 text-sm bg-foreground text-background rounded hover:opacity-85"
            onClick={() => conn.connect().catch(() => {})}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Not connected yet (initial state before connect() is called)
  if (status !== 'connected') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground/50 animate-pulse">Loading...</p>
      </div>
    );
  }

  // Connected — render the full App (NormalLayout, navbar, router-based navigation)
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <App />
      </QueryClientProvider>
    </ConnectionProvider>
  );
}
