import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type {
  ServerConfig,
  DirectServerConfig,
  E2EEServerConfig,
  ServerConnectionStatus,
} from '@/lib/servers/types';
import { getServerBaseUrl } from '@/lib/servers/types';
import { getServerStore } from '@/lib/servers/serverStore';
import {
  setActiveServer,
  subscribe,
  getConnectionIdSnapshot,
} from '@/lib/activeServer';
import { E2EEConnection } from '@/lib/e2ee';
import { queryClient } from '@/main';

interface ServerManagerContextValue {
  servers: ServerConfig[];
  activeServerId: string | null;
  connectionStatus: ServerConnectionStatus;
  connectionError: string | null;
  /** Monotonically increasing — use as React key/dependency to force WS reconnect */
  connectionId: number;
  loading: boolean;

  addServer(config: ServerConfig): Promise<void>;
  updateServer(config: ServerConfig): Promise<void>;
  removeServer(serverId: string): Promise<void>;
  connectToServer(serverId: string): Promise<void>;
  disconnectFromServer(): void;
}

const ServerManagerContext = createContext<ServerManagerContextValue | null>(
  null
);

export function useServerManager(): ServerManagerContextValue {
  const ctx = useContext(ServerManagerContext);
  if (!ctx)
    throw new Error('useServerManager must be within ServerManagerProvider');
  return ctx;
}

export function ServerManagerProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ServerConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionRef] = useState<{ current: E2EEConnection | null }>({
    current: null,
  });

  const connectionId = useSyncExternalStore(subscribe, getConnectionIdSnapshot);

  // Load servers on mount
  useEffect(() => {
    (async () => {
      const store = getServerStore();
      const saved = await store.getServers();
      setServers(saved);
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next: ServerConfig[]) => {
    setServers(next);
    await getServerStore().saveServers(next);
  }, []);

  const addServer = useCallback(
    async (config: ServerConfig) => {
      await persist([...servers, config]);
    },
    [servers, persist]
  );

  const updateServer = useCallback(
    async (config: ServerConfig) => {
      await persist(servers.map((s) => (s.id === config.id ? config : s)));
    },
    [servers, persist]
  );

  const removeServer = useCallback(
    async (serverId: string) => {
      if (activeServerId === serverId) {
        disconnectFromServer();
      }
      await getServerStore().clearServerSession(serverId);
      await persist(servers.filter((s) => s.id !== serverId));
    },
    [servers, activeServerId, persist]
  );

  const disconnectFromServer = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = null;
    }
    setActiveServer(null);
    setActiveServerId(null);
    setConnectionStatus('disconnected');
    setConnectionError(null);
  }, []);

  const connectToServer = useCallback(
    async (serverId: string) => {
      const config = servers.find((s) => s.id === serverId);
      if (!config) return;

      // Disconnect previous
      if (connectionRef.current) {
        connectionRef.current.disconnect();
        connectionRef.current = null;
      }

      setActiveServerId(serverId);
      setConnectionStatus('connecting');
      setConnectionError(null);

      try {
        if (config.type === 'direct') {
          await connectDirect(config);
        } else {
          await connectE2EE(config);
        }

        // Update lastConnectedAt
        const now = new Date().toISOString();
        await persist(
          servers.map((s) =>
            s.id === serverId ? { ...s, lastConnectedAt: now } : s
          )
        );

        setConnectionStatus('connected');
        // Clear all cached data from previous server
        queryClient.clear();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setConnectionError(msg);
        setConnectionStatus('error');
        setActiveServer(null);
        setActiveServerId(null);
      }
    },
    [servers, persist]
  );

  const connectDirect = async (config: DirectServerConfig) => {
    const baseUrl = getServerBaseUrl(config);

    // Test connection
    const resp = await fetch(`${baseUrl}/api/info`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      throw new Error(`Server returned ${resp.status}`);
    }

    setActiveServer({ type: 'direct', baseUrl });
  };

  const connectE2EE = async (config: E2EEServerConfig) => {
    const store = getServerStore();
    const session = await store.getServerSession(config.id);
    if (!session?.sessionToken || !session?.machineId) {
      throw new Error('No saved session. Please re-add this server.');
    }

    const conn = new E2EEConnection();
    connectionRef.current = conn;

    await conn.connect({
      gatewayUrl: config.gatewayUrl,
      sessionToken: session.sessionToken as string,
      machineId: session.machineId as string,
      onDisconnect: () => {
        setConnectionStatus('disconnected');
        setActiveServer(null);
      },
      onError: (error) => {
        setConnectionError(error);
        setConnectionStatus('error');
      },
    });

    // Subscribe to machine
    conn.subscribeMachine(session.machineId as string);

    setActiveServer({ type: 'e2ee', connection: conn });
  };

  return (
    <ServerManagerContext.Provider
      value={{
        servers,
        activeServerId,
        connectionStatus,
        connectionError,
        connectionId,
        loading,
        addServer,
        updateServer,
        removeServer,
        connectToServer,
        disconnectFromServer,
      }}
    >
      {children}
    </ServerManagerContext.Provider>
  );
}
