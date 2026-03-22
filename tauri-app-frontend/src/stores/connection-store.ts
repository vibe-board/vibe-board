import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ServerConfig, ServerStatus, GatewayMachine } from '@/types';
import { createApiClient, type ApiClient } from '@/lib/api';
import { GatewayConnection } from '@/lib/gateway';
import { deriveKeysFromMasterSecret, generateMasterSecret } from '@/lib/crypto';

interface ConnectionState {
  servers: ServerConfig[];
  statuses: Record<string, ServerStatus>;
  clients: Record<string, ApiClient>;
  gatewayConnections: Record<string, GatewayConnection>;
  gatewayMachines: Record<string, GatewayMachine[]>;
  activeServerId: string | null;
}

interface ConnectionActions {
  addServer(config: ServerConfig): void;
  removeServer(id: string): void;
  updateServer(id: string, updates: Partial<ServerConfig>): void;
  setActiveServer(id: string): void;
  connectToServer(id: string): Promise<void>;
  disconnectFromServer(id: string): void;
  connectGateway(serverId: string): void;
  disconnectGateway(serverId: string): void;
  getActiveClient(): ApiClient | null;
  getGatewayConnection(serverId: string): GatewayConnection | null;
  loadPersisted(): void;
  persist(): void;
}

const STORAGE_KEY = 'vibe-board-servers';

export const useConnectionStore = create<ConnectionState & ConnectionActions>()(
  immer((set, get) => ({
    servers: [],
    statuses: {},
    clients: {},
    gatewayConnections: {},
    gatewayMachines: {},
    activeServerId: null,

    addServer(config) {
      set((state) => {
        state.servers.push(config);
        if (config.isDefault || state.servers.length === 1) {
          state.activeServerId = config.id;
        }
      });
      get().persist();
      get().connectToServer(config.id);
    },

    removeServer(id) {
      get().disconnectFromServer(id);
      set((state) => {
        state.servers = state.servers.filter((s) => s.id !== id);
        delete state.statuses[id];
        delete state.clients[id];
        if (state.activeServerId === id) {
          state.activeServerId = state.servers[0]?.id ?? null;
        }
      });
      get().persist();
    },

    updateServer(id, updates) {
      set((state) => {
        const idx = state.servers.findIndex((s) => s.id === id);
        if (idx >= 0) {
          Object.assign(state.servers[idx], updates);
        }
      });
      get().persist();
    },

    setActiveServer(id) {
      set({ activeServerId: id });
      get().persist();
    },

    async connectToServer(id) {
      const server = get().servers.find((s) => s.id === id);
      if (!server) return;

      const client = createApiClient({
        baseUrl: server.url,
        gatewayMode: server.mode === 'gateway',
        onUnauthorized: () => {
          set((state) => {
            state.statuses[id] = { serverId: id, connected: false, error: 'Unauthorized' };
          });
        },
      });

      set((state) => {
        state.clients[id] = client;
      });

      try {
        const start = Date.now();
        await client.get('/api/health');
        const latency = Date.now() - start;
        set((state) => {
          state.statuses[id] = { serverId: id, connected: true, lastSeen: new Date().toISOString(), latency };
        });

        if (server.mode === 'gateway' && server.gatewayUrl) {
          get().connectGateway(id);
        }
      } catch (err) {
        set((state) => {
          state.statuses[id] = {
            serverId: id,
            connected: false,
            error: err instanceof Error ? err.message : 'Connection failed',
          };
        });
      }
    },

    disconnectFromServer(id) {
      get().disconnectGateway(id);
      set((state) => {
        delete state.clients[id];
        state.statuses[id] = { serverId: id, connected: false };
      });
    },

    connectGateway(serverId) {
      const server = get().servers.find((s) => s.id === serverId);
      if (!server?.gatewayUrl || !server.gatewayToken) return;

      const existing = get().gatewayConnections[serverId];
      if (existing) existing.disconnect();

      let e2eeKeys = null;
      if (server.masterSecret) {
        e2eeKeys = deriveKeysFromMasterSecret(server.masterSecret);
      }

      const conn = new GatewayConnection(server.gatewayUrl, server.gatewayToken, e2eeKeys);

      conn.on((event) => {
        if (event.type === 'machines') {
          set((state) => {
            state.gatewayMachines[serverId] = event.machines;
          });
        } else if (event.type === 'machine_online' || event.type === 'machine_offline') {
          set((state) => {
            const machines = state.gatewayMachines[serverId] ?? [];
            state.gatewayMachines[serverId] = machines.map((m) =>
              m.machine_id === event.machine_id
                ? { ...m, online: event.type === 'machine_online' }
                : m,
            );
          });
        }
      });

      conn.connect();

      set((state) => {
        state.gatewayConnections[serverId] = conn;
      });
    },

    disconnectGateway(serverId) {
      const conn = get().gatewayConnections[serverId];
      if (conn) {
        conn.disconnect();
        set((state) => {
          delete state.gatewayConnections[serverId];
          delete state.gatewayMachines[serverId];
        });
      }
    },

    getActiveClient() {
      const { activeServerId, clients } = get();
      if (!activeServerId) return null;
      return clients[activeServerId] ?? null;
    },

    getGatewayConnection(serverId) {
      return get().gatewayConnections[serverId] ?? null;
    },

    loadPersisted() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw) as { servers: ServerConfig[]; activeServerId: string | null };
          set({ servers: data.servers, activeServerId: data.activeServerId });
          for (const server of data.servers) {
            get().connectToServer(server.id);
          }
        }
      } catch {
        // ignore
      }
    },

    persist() {
      const { servers, activeServerId } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ servers, activeServerId }));
    },
  })),
);
