// frontend/src/stores/connection-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DirectConnection } from '@/lib/connections/directConnection';
import type {
  ConnectionEntryPersisted,
  TabPersisted,
  UnifiedConnection,
  GatewaySession,
} from '@/lib/connections/types';
import type { MachineStatus } from '@/lib/e2ee';
import { runMigrationIfNeeded } from './migration';
import { isGateway } from '@/lib/appMode';
import * as gatewayService from '@/services/gateway-service';
import * as machineRegistry from '@/services/machine-registry';

export const GATEWAY_SELF_ID = 'gateway-self';

// -- Persistence helpers --

function loadConnections(): ConnectionEntryPersisted[] {
  try {
    const raw = localStorage.getItem('vb_connections');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConnections(entries: ConnectionEntryPersisted[]): void {
  localStorage.setItem('vb_connections', JSON.stringify(entries));
}

function loadTabs(): TabPersisted[] {
  try {
    const raw = localStorage.getItem('vb_tabs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTabs(tabs: TabPersisted[]): void {
  localStorage.setItem('vb_tabs', JSON.stringify(tabs));
}

function loadActiveTab(): string {
  return sessionStorage.getItem('vb_active_tab') || 'home';
}

function saveActiveTab(id: string): void {
  sessionStorage.setItem('vb_active_tab', id);
}

// -- Store types --

export interface GatewayState {
  session: GatewaySession | null;
  machines: MachineStatus[];
  registrationOpen: boolean | null;
  authError: string | null;
  authLoading: boolean;
}

export const EMPTY_GATEWAY_STATE: GatewayState = {
  session: null,
  machines: [],
  registrationOpen: null,
  authError: null,
  authLoading: false,
};

interface ConnectionNode {
  entry: ConnectionEntryPersisted;
  directConn?: DirectConnection;
  gatewayUrl?: string; // constant, set at creation (gateway type only)
  gatewayState?: GatewayState; // new: reactive plain data
}

export interface ConnectionStoreState {
  nodes: ConnectionNode[];
  tabs: TabPersisted[];
  activeTabId: string;
  initialized: boolean;
  machineSecrets: Record<string, string>; // machineId -> base64 master secret
}

export interface ConnectionStoreActions {
  init(): void;
  addConnection(
    type: 'direct' | 'gateway',
    url: string,
    label?: string
  ): string;
  removeConnection(id: string): void;
  updateConnectionUrl(id: string, url: string): void;
  loginConnection(id: string, email: string, password: string): Promise<void>;
  signupConnection(
    id: string,
    email: string,
    password: string,
    name?: string
  ): Promise<void>;
  logoutConnection(id: string): void;
  pairMachine(machineId: string, base64Secret: string): void;
  unpairMachine(connectionId: string, machineId: string): void;
  setGatewayField: <K extends keyof GatewayState>(
    connectionId: string,
    key: K,
    value: GatewayState[K]
  ) => void;
  setMachines: (connectionId: string, machines: MachineStatus[]) => void;
  upsertMachine: (connectionId: string, machine: MachineStatus) => void;
  removeMachine: (connectionId: string, machineId: string) => void;
  getConnection(
    connectionId: string,
    machineId?: string
  ): UnifiedConnection | null;
  openProjectTab(
    connectionId: string,
    machineId: string | undefined,
    projectId: string,
    label: string
  ): void;
  openMachineProjectsTab(
    connectionId: string,
    machineId: string | undefined,
    label: string
  ): void;
  closeTab(tabId: string): void;
  setActiveTab(tabId: string): void;
  reorderTabs(fromIndex: number, toIndex: number): void;
  getNode(connectionId: string): ConnectionNode | undefined;
  getMachines(connectionId: string): MachineStatus[];
  getSession(connectionId: string): GatewaySession | null;
}

export type ConnectionStore = ConnectionStoreState & ConnectionStoreActions;

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      nodes: [],
      tabs: [],
      activeTabId: 'home',
      initialized: false,
      machineSecrets: {},

      pairMachine(machineId, secret) {
        set((s) => ({
          machineSecrets: { ...s.machineSecrets, [machineId]: secret },
        }));
      },
      unpairMachine(connectionId, machineId) {
        // 1. Close any tabs bound to this machine. closeTab handles connection
        //    removeRef and the activeTabId -> 'home' fallback for us.
        const tabIds = get()
          .tabs.filter(
            (t) => t.connectionId === connectionId && t.machineId === machineId
          )
          .map((t) => t.id);
        for (const id of tabIds) get().closeTab(id);

        // 2. Tear down the live E2EE connection immediately (removeRef alone
        //    only schedules a delayed disconnect).
        machineRegistry.destroy(connectionId, machineId);

        // 3. Forget the master secret -> the row reverts to "Not paired".
        set((s) => {
          const { [machineId]: _removed, ...rest } = s.machineSecrets;
          return { machineSecrets: rest };
        });
      },

      setGatewayField(connectionId, key, value) {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.entry.id === connectionId && n.gatewayState
              ? { ...n, gatewayState: { ...n.gatewayState, [key]: value } }
              : n
          ),
        }));
      },
      setMachines(connectionId, machines) {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.entry.id === connectionId && n.gatewayState
              ? { ...n, gatewayState: { ...n.gatewayState, machines } }
              : n
          ),
        }));
      },
      upsertMachine(connectionId, machine) {
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.entry.id !== connectionId || !n.gatewayState) return n;
            const existing = n.gatewayState.machines.findIndex(
              (m) => m.machine_id === machine.machine_id
            );
            const machines =
              existing >= 0
                ? n.gatewayState.machines.map((m, i) =>
                    i === existing ? machine : m
                  )
                : [...n.gatewayState.machines, machine];
            return { ...n, gatewayState: { ...n.gatewayState, machines } };
          }),
        }));
      },
      removeMachine(connectionId, machineId) {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.entry.id === connectionId && n.gatewayState
              ? {
                  ...n,
                  gatewayState: {
                    ...n.gatewayState,
                    machines: n.gatewayState.machines.filter(
                      (m) => m.machine_id !== machineId
                    ),
                  },
                }
              : n
          ),
        }));
      },

      init() {
        if (get().initialized) return;
        runMigrationIfNeeded();

        let entries = loadConnections();

        if (isGateway) {
          const sameOrigin = window.location.origin;
          const existing = entries.find((e) => e.id === GATEWAY_SELF_ID);
          if (existing) {
            entries = entries
              .filter((e) => e.id === GATEWAY_SELF_ID)
              .map((e) => ({ ...e, url: sameOrigin }));
          } else {
            entries = [
              {
                id: GATEWAY_SELF_ID,
                type: 'gateway',
                url: sameOrigin,
                label: 'Gateway',
              },
            ];
          }
          // Deliberately DO NOT call saveConnections — leave localStorage alone so
          // switching back to tauri preserves the user's other connections.
        }

        const nodes: ConnectionNode[] = entries.map((entry) => {
          if (entry.type === 'direct') {
            const conn = new DirectConnection(
              entry.id,
              entry.url,
              entry.label || entry.url
            );
            conn.connect().catch(() => {});
            return { entry, directConn: conn };
          } else {
            const persistedSession = gatewayService.loadPersistedSession(
              entry.id
            );
            gatewayService.fetchRegistrationStatus(entry.id, entry.url);
            if (persistedSession) {
              gatewayService.startMachineListWs(
                entry.id,
                entry.url,
                persistedSession
              );
            }
            return {
              entry,
              gatewayUrl: entry.url,
              gatewayState: {
                ...EMPTY_GATEWAY_STATE,
                session: persistedSession,
              },
            };
          }
        });

        const tabs = loadTabs();
        const activeTabId = loadActiveTab();
        set({ nodes, tabs, activeTabId, initialized: true });
      },

      addConnection(type, url, label) {
        const id = crypto.randomUUID();
        const entry: ConnectionEntryPersisted = { id, type, url, label };
        const node: ConnectionNode = { entry };

        if (type === 'direct') {
          const conn = new DirectConnection(id, url, label || url);
          conn.connect().catch(() => {});
          node.directConn = conn;
        } else {
          gatewayService.fetchRegistrationStatus(id, url);
          node.gatewayUrl = url;
          node.gatewayState = { ...EMPTY_GATEWAY_STATE };
        }

        set((s) => {
          const nodes = [...s.nodes, node];
          saveConnections(nodes.map((n) => n.entry));
          return { nodes };
        });
        return id;
      },

      removeConnection(id) {
        if (isGateway && id === GATEWAY_SELF_ID) return;
        set((s) => {
          const node = s.nodes.find((n) => n.entry.id === id);
          if (node?.directConn) node.directConn.disconnect();
          if (node?.gatewayState) {
            gatewayService.stopMachineListWs(id);
            machineRegistry.destroyAllForConnection(id);
          }
          localStorage.removeItem(`vb_gateway_session_${id}`);

          const nodes = s.nodes.filter((n) => n.entry.id !== id);
          const tabs = s.tabs.filter((t) => t.connectionId !== id);
          saveConnections(nodes.map((n) => n.entry));
          saveTabs(tabs);

          const activeTabId = tabs.find((t) => t.id === s.activeTabId)
            ? s.activeTabId
            : 'home';
          saveActiveTab(activeTabId);
          return { nodes, tabs, activeTabId };
        });
      },

      updateConnectionUrl(id, url) {
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.entry.id !== id) return n;
            const entry = { ...n.entry, url };
            if (n.directConn) n.directConn.disconnect();
            if (n.gatewayState) {
              gatewayService.stopMachineListWs(n.entry.id);
              machineRegistry.destroyAllForConnection(n.entry.id);
            }

            if (entry.type === 'direct') {
              const conn = new DirectConnection(id, url, entry.label || url);
              conn.connect().catch(() => {});
              return { entry, directConn: conn };
            } else {
              gatewayService.fetchRegistrationStatus(id, url);
              return {
                entry,
                gatewayUrl: url,
                gatewayState: { ...EMPTY_GATEWAY_STATE },
              };
            }
          });
          saveConnections(nodes.map((n) => n.entry));
          return { nodes };
        });
      },

      async loginConnection(id, email, password) {
        const node = get().nodes.find((n) => n.entry.id === id);
        if (!node?.gatewayState || !node.gatewayUrl) return;
        await gatewayService.login(id, node.gatewayUrl, email, password);
      },

      async signupConnection(id, email, password, name) {
        const node = get().nodes.find((n) => n.entry.id === id);
        if (!node?.gatewayState || !node.gatewayUrl) return;
        await gatewayService.signup(id, node.gatewayUrl, email, password, name);
      },

      logoutConnection(id) {
        gatewayService.logout(id);
        set((s) => {
          const tabs = s.tabs.filter((t) => t.connectionId !== id);
          saveTabs(tabs);
          const activeTabId = tabs.find((t) => t.id === s.activeTabId)
            ? s.activeTabId
            : 'home';
          saveActiveTab(activeTabId);
          return { nodes: [...s.nodes], tabs, activeTabId };
        });
      },

      getConnection(connectionId, machineId) {
        const node = get().nodes.find((n) => n.entry.id === connectionId);
        if (!node) return null;
        if (node.directConn) return node.directConn;
        if (node.gatewayState?.session && node.gatewayUrl && machineId) {
          const machine = node.gatewayState.machines.find(
            (m) => m.machine_id === machineId
          );
          return machineRegistry.getOrCreate(
            connectionId,
            machineId,
            node.gatewayUrl,
            node.gatewayState.session,
            machine?.hostname || machineId.slice(0, 8)
          );
        }
        return null;
      },

      openProjectTab(connectionId, machineId, projectId, label) {
        set((s) => {
          const existing = s.tabs.find(
            (t) =>
              t.connectionId === connectionId &&
              t.machineId === machineId &&
              t.projectId === projectId
          );
          if (existing) {
            saveActiveTab(existing.id);
            return { activeTabId: existing.id };
          }

          const tab: TabPersisted = {
            id: crypto.randomUUID(),
            type: 'project',
            connectionId,
            machineId,
            projectId,
            label,
          };
          const tabs = [...s.tabs, tab];
          saveTabs(tabs);
          saveActiveTab(tab.id);

          const node = s.nodes.find((n) => n.entry.id === connectionId);
          if (node?.gatewayState?.session && node.gatewayUrl && machineId) {
            const machine = node.gatewayState.machines.find(
              (m) => m.machine_id === machineId
            );
            const conn = machineRegistry.getOrCreate(
              connectionId,
              machineId,
              node.gatewayUrl,
              node.gatewayState.session,
              machine?.hostname || machineId.slice(0, 8)
            );
            conn.addRef();
            if (conn.status === 'disconnected') {
              conn.connect().catch(() => {});
            }
          }

          return { tabs, activeTabId: tab.id };
        });
      },

      openMachineProjectsTab(connectionId, machineId, label) {
        set((s) => {
          // Reuse existing tab if one matches
          const existing = s.tabs.find(
            (t) =>
              t.type === 'machine-projects' &&
              t.connectionId === connectionId &&
              t.machineId === machineId
          );
          if (existing) {
            saveActiveTab(existing.id);
            return { activeTabId: existing.id };
          }

          const tab: TabPersisted = {
            id: crypto.randomUUID(),
            type: 'machine-projects',
            connectionId,
            machineId,
            label,
          };
          const tabs = [...s.tabs, tab];
          saveTabs(tabs);
          saveActiveTab(tab.id);

          // For gateway machines, add ref to keep connection alive
          const node = s.nodes.find((n) => n.entry.id === connectionId);
          if (node?.gatewayState?.session && node.gatewayUrl && machineId) {
            const machine = node.gatewayState.machines.find(
              (m) => m.machine_id === machineId
            );
            const conn = machineRegistry.getOrCreate(
              connectionId,
              machineId,
              node.gatewayUrl,
              node.gatewayState.session,
              machine?.hostname || machineId.slice(0, 8)
            );
            conn.addRef();
            if (conn.status === 'disconnected') {
              conn.connect().catch(() => {});
            }
          }

          return { tabs, activeTabId: tab.id };
        });
      },

      closeTab(tabId) {
        set((s) => {
          const tab = s.tabs.find((t) => t.id === tabId);
          if (!tab || tab.type === 'home') return s;

          if (tab.connectionId && tab.machineId) {
            const node = s.nodes.find((n) => n.entry.id === tab.connectionId);
            if (node?.gatewayState?.session && node.gatewayUrl) {
              const machine = node.gatewayState.machines.find(
                (m) => m.machine_id === tab.machineId
              );
              const conn = machineRegistry.getOrCreate(
                tab.connectionId,
                tab.machineId,
                node.gatewayUrl,
                node.gatewayState.session,
                machine?.hostname || tab.machineId.slice(0, 8)
              );
              conn.removeRef();
            }
          }

          const tabs = s.tabs.filter((t) => t.id !== tabId);
          saveTabs(tabs);

          let activeTabId = s.activeTabId;
          if (activeTabId === tabId) {
            const closedIdx = s.tabs.findIndex((t) => t.id === tabId);
            const nextTab = tabs[Math.min(closedIdx, tabs.length - 1)];
            activeTabId = nextTab?.id || 'home';
            saveActiveTab(activeTabId);
          }

          return { tabs, activeTabId };
        });
      },

      setActiveTab(tabId) {
        saveActiveTab(tabId);
        set({ activeTabId: tabId });
      },

      reorderTabs(fromIndex, toIndex) {
        set((s) => {
          const tabs = [...s.tabs];
          const [moved] = tabs.splice(fromIndex, 1);
          tabs.splice(toIndex, 0, moved);
          saveTabs(tabs);
          return { tabs };
        });
      },

      getNode(connectionId) {
        return get().nodes.find((n) => n.entry.id === connectionId);
      },

      getMachines(connectionId) {
        const node = get().nodes.find((n) => n.entry.id === connectionId);
        return node?.gatewayState?.machines ?? [];
      },

      getSession(connectionId) {
        const node = get().nodes.find((n) => n.entry.id === connectionId);
        return node?.gatewayState?.session ?? null;
      },
    }),
    {
      name: 'vb_connection_store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ machineSecrets: state.machineSecrets }),
    }
  )
);
