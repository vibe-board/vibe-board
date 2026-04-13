// frontend/src/stores/connection-store.ts
import { create } from 'zustand';
import { DirectConnection } from '@/lib/connections/direct-connection';
import { GatewayNode } from '@/lib/connections/gateway-node';
import type {
  ConnectionEntryPersisted,
  TabPersisted,
  UnifiedConnection,
  GatewaySession,
} from '@/lib/connections/types';
import type { MachineStatus } from '@/lib/e2ee';
import { runMigrationIfNeeded } from './migration';

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

interface ConnectionNode {
  entry: ConnectionEntryPersisted;
  directConn?: DirectConnection;
  gatewayNode?: GatewayNode;
}

export interface ConnectionStoreState {
  nodes: ConnectionNode[];
  tabs: TabPersisted[];
  activeTabId: string;
  initialized: boolean;
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
  pairMachine(
    connectionId: string,
    machineId: string,
    base64Secret: string
  ): void;
  unpairMachine(connectionId: string, machineId: string): void;
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
  closeTab(tabId: string): void;
  setActiveTab(tabId: string): void;
  reorderTabs(fromIndex: number, toIndex: number): void;
  getNode(connectionId: string): ConnectionNode | undefined;
  getGatewayNode(connectionId: string): GatewayNode | undefined;
  getMachines(connectionId: string): MachineStatus[];
  getSession(connectionId: string): GatewaySession | null;
}

export type ConnectionStore = ConnectionStoreState & ConnectionStoreActions;

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  nodes: [],
  tabs: [],
  activeTabId: 'home',
  initialized: false,

  init() {
    if (get().initialized) return;
    runMigrationIfNeeded();

    const entries = loadConnections();
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
        const node = new GatewayNode(entry.id, entry.url);
        node.loadSession();
        node.fetchRegistrationStatus();
        if (node.session) {
          node.startMachineListWs();
        }
        return { entry, gatewayNode: node };
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
      const gwNode = new GatewayNode(id, url);
      gwNode.fetchRegistrationStatus();
      node.gatewayNode = gwNode;
    }

    set((s) => {
      const nodes = [...s.nodes, node];
      saveConnections(nodes.map((n) => n.entry));
      return { nodes };
    });
    return id;
  },

  removeConnection(id) {
    set((s) => {
      const node = s.nodes.find((n) => n.entry.id === id);
      if (node?.directConn) node.directConn.disconnect();
      if (node?.gatewayNode) node.gatewayNode.destroy();
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
        if (n.gatewayNode) n.gatewayNode.destroy();

        if (entry.type === 'direct') {
          const conn = new DirectConnection(id, url, entry.label || url);
          conn.connect().catch(() => {});
          return { entry, directConn: conn };
        } else {
          const gwNode = new GatewayNode(id, url);
          gwNode.fetchRegistrationStatus();
          return { entry, gatewayNode: gwNode };
        }
      });
      saveConnections(nodes.map((n) => n.entry));
      return { nodes };
    });
  },

  async loginConnection(id, email, password) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayNode) return;
    await node.gatewayNode.login(email, password);
    set((s) => ({ nodes: [...s.nodes] }));
  },

  async signupConnection(id, email, password, name) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayNode) return;
    await node.gatewayNode.signup(email, password, name);
    set((s) => ({ nodes: [...s.nodes] }));
  },

  logoutConnection(id) {
    const node = get().nodes.find((n) => n.entry.id === id);
    if (!node?.gatewayNode) return;
    node.gatewayNode.logout();

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

  pairMachine(connectionId, machineId, base64Secret) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    if (!node?.gatewayNode) return;
    node.gatewayNode.pairMachine(machineId, base64Secret);
    set((s) => ({ nodes: [...s.nodes] }));
  },

  unpairMachine(connectionId, machineId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    if (!node?.gatewayNode) return;
    node.gatewayNode.unpairMachine(machineId);
    set((s) => ({ nodes: [...s.nodes] }));
  },

  getConnection(connectionId, machineId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    if (!node) return null;
    if (node.directConn) return node.directConn;
    if (node.gatewayNode && machineId) {
      return node.gatewayNode.getMachineConnection(machineId);
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
      if (node?.gatewayNode && machineId) {
        const conn = node.gatewayNode.getMachineConnection(machineId);
        conn?.addRef();
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
        if (node?.gatewayNode) {
          const conn = node.gatewayNode.getMachineConnection(tab.machineId);
          conn?.removeRef();
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

  getGatewayNode(connectionId) {
    return get().nodes.find((n) => n.entry.id === connectionId)?.gatewayNode;
  },

  getMachines(connectionId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    return node?.gatewayNode?.machines ?? [];
  },

  getSession(connectionId) {
    const node = get().nodes.find((n) => n.entry.id === connectionId);
    return node?.gatewayNode?.session ?? null;
  },
}));
