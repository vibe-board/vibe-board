import { createContext, useContext, createSignal, type JSX, type Component, onMount, createMemo } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform';

export interface ServerConnection {
  id: string;
  name: string;
  type: 'direct' | 'gateway';
  url: string;
  gatewayUrl?: string;
  masterSecret?: string;
  machineId?: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError?: string;
}

interface ConnectionState {
  servers: ServerConnection[];
  activeServerId: string | null;
}

interface ConnectionContextValue {
  state: ConnectionState;
  activeServer: () => ServerConnection | undefined;
  addServer: (server: Omit<ServerConnection, 'status'>) => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<ServerConnection>) => void;
  setActiveServer: (id: string) => void;
  testConnection: (url: string) => Promise<boolean>;
}

const ConnectionContext = createContext<ConnectionContextValue>();

export const ConnectionProvider: Component<{ children: JSX.Element }> = (props) => {
  const [state, setState] = createStore<ConnectionState>({
    servers: [],
    activeServerId: null,
  });

  const activeServer = createMemo(() =>
    state.servers.find(s => s.id === state.activeServerId)
  );

  onMount(() => {
    const saved = localStorage.getItem('vb-connections');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ConnectionState;
        setState(parsed);
      } catch {}
    }
  });

  const persist = () => {
    localStorage.setItem('vb-connections', JSON.stringify({
      servers: state.servers,
      activeServerId: state.activeServerId,
    }));
  };

  const addServer = (server: Omit<ServerConnection, 'status'>) => {
    setState(produce(s => {
      s.servers.push({ ...server, status: 'disconnected' });
      if (!s.activeServerId) s.activeServerId = server.id;
    }));
    persist();
  };

  const removeServer = (id: string) => {
    setState(produce(s => {
      s.servers = s.servers.filter(sv => sv.id !== id);
      if (s.activeServerId === id) {
        s.activeServerId = s.servers[0]?.id ?? null;
      }
    }));
    persist();
  };

  const updateServer = (id: string, updates: Partial<ServerConnection>) => {
    setState(produce(s => {
      const idx = s.servers.findIndex(sv => sv.id === id);
      if (idx !== -1) Object.assign(s.servers[idx], updates);
    }));
    persist();
  };

  const setActiveServer = (id: string) => {
    setState('activeServerId', id);
    persist();
  };

  const testConnection = async (url: string): Promise<boolean> => {
    try {
      if (isTauri()) {
        return await invoke<boolean>('test_server_health', { url });
      }
      const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      return resp.ok;
    } catch {
      return false;
    }
  };

  return (
    <ConnectionContext.Provider value={{ state, activeServer, addServer, removeServer, updateServer, setActiveServer, testConnection }}>
      {props.children}
    </ConnectionContext.Provider>
  );
};

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}
