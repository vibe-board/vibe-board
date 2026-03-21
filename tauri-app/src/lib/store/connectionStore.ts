import { create } from 'zustand';
import { E2EEConnection, type MachineStatus } from '@/lib/crypto';

export type ConnectionType = 'direct' | 'e2ee';

export interface Server {
  id: string;
  name: string;
  url: string;
  type: ConnectionType;
}

export interface Gateway {
  id: string;
  name: string;
  url: string;
  sessionToken: string;
  userId: string;
  masterSecret: string;
}

interface ConnectionState {
  servers: Server[];
  gateways: Gateway[];
  activeServerId: string | null;
  activeGatewayId: string | null;
  activeMachineId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  e2eeConnection: E2EEConnection | null;
  machines: MachineStatus[];

  addServer: (server: Server) => void;
  removeServer: (id: string) => void;
  setActiveServer: (id: string | null) => void;

  addGateway: (gateway: Gateway) => void;
  removeGateway: (id: string) => void;
  setActiveGateway: (id: string | null) => void;

  setActiveMachine: (id: string | null) => void;
  setConnectionStatus: (status: ConnectionState['connectionStatus']) => void;
  setE2eeConnection: (conn: E2EEConnection | null) => void;
  setMachines: (machines: MachineStatus[]) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  servers: [],
  gateways: [],
  activeServerId: null,
  activeGatewayId: null,
  activeMachineId: null,
  connectionStatus: 'disconnected',
  e2eeConnection: null,
  machines: [],

  addServer: (server) =>
    set((state) => ({ servers: [...state.servers, server] })),
  removeServer: (id) =>
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      activeServerId: state.activeServerId === id ? null : state.activeServerId,
    })),
  setActiveServer: (id) => set({ activeServerId: id }),

  addGateway: (gateway) =>
    set((state) => ({ gateways: [...state.gateways, gateway] })),
  removeGateway: (id) =>
    set((state) => ({
      gateways: state.gateways.filter((g) => g.id !== id),
      activeGatewayId:
        state.activeGatewayId === id ? null : state.activeGatewayId,
    })),
  setActiveGateway: (id) => set({ activeGatewayId: id }),

  setActiveMachine: (id) => set({ activeMachineId: id }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setE2eeConnection: (conn) => set({ e2eeConnection: conn }),
  setMachines: (machines) => set({ machines }),
}));
