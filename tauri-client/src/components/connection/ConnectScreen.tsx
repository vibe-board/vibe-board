import { useState } from 'react';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { testConnection } from '@/api/connection';
import { ensureNotificationPermission } from '@/lib/notifications';
import { isMobile } from '@/lib/platform';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'disconnected';

/** Mobile-only: gateway URL input, no health check, straight to E2EE */
function MobileConnectScreen() {
  const { serverUrl, setConnection } = useConnectionStore();
  const [url, setUrl] = useState(serverUrl);

  const handleConnect = () => {
    if (!url.trim()) return;
    // Only set mode + URL; do NOT set isConnected — the GatewayProvider
    // lifecycle (login → machine_select → ready) handles that.
    setConnection(url.trim(), undefined, 'gateway');
    ensureNotificationPermission();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Vibe Board</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your E2EE gateway URL
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="gateway-url"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Gateway URL
            </label>
            <input
              id="gateway-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://gateway.example.com"
              className={cn(
                'w-full rounded-md border border-input bg-background px-3 py-2',
                'text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
              )}
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={!url.trim()}
            className={cn(
              'w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground',
              'hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

/** Desktop: full connection with mode detection and health check */
function DesktopConnectScreen() {
  const { serverUrl, setConnection, setConnected } = useConnectionStore();
  const [url, setUrl] = useState(serverUrl);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!url.trim()) {
      setError('Please enter a server URL');
      return;
    }

    setStatus('testing');
    setError(null);

    try {
      const result = await testConnection(url.trim());

      if (result.connected) {
        setConnection(url.trim(), undefined, result.mode);
        setConnected(true);
        setStatus('connected');
        ensureNotificationPermission();
      } else {
        setStatus('disconnected');
        setError('Failed to connect to server');
      }
    } catch {
      setStatus('disconnected');
      setError('Connection failed');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Vibe Kanban</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect to your server
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="server-url"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Server URL
            </label>
            <input
              id="server-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:3001"
              className={cn(
                'w-full rounded-md border border-input bg-background px-3 py-2',
                'text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
              disabled={status === 'testing'}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={status === 'testing'}
            className={cn(
              'w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground',
              'hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {status === 'testing' ? 'Connecting...' : 'Connect'}
          </button>

          <div className="flex items-center justify-center space-x-2">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                status === 'connected' && 'bg-green-500',
                status === 'disconnected' && 'bg-red-500',
                status === 'testing' && 'bg-yellow-500',
                status === 'idle' && 'bg-gray-400'
              )}
            />
            <span className="text-sm text-muted-foreground">
              {status === 'connected' && 'Connected'}
              {status === 'disconnected' && 'Disconnected'}
              {status === 'testing' && 'Testing connection...'}
              {status === 'idle' && 'Not connected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConnectScreen() {
  return isMobile() ? <MobileConnectScreen /> : <DesktopConnectScreen />;
}
