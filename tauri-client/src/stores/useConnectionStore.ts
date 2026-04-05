import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/api/client';

interface ConnectionState {
  serverUrl: string;
  token: string | null;
  mode: 'local' | 'gateway';
  isConnected: boolean;
  setConnection: (url: string, token?: string, mode?: 'local' | 'gateway') => void;
  disconnect: () => void;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      serverUrl: 'http://localhost:3001',
      token: null,
      mode: 'local',
      isConnected: false,
      setConnection: (url, token, mode = 'local') => {
        apiClient.updateConnection(url, token);
        set({ serverUrl: url, token: token ?? null, mode });
      },
      disconnect: () => {
        apiClient.updateConnection('', undefined);
        set({ isConnected: false });
      },
      setConnected: (connected) => set({ isConnected: connected }),
    }),
    { name: 'vibe-connection', partialize: (s) => ({ serverUrl: s.serverUrl, token: s.token, mode: s.mode }) },
  ),
);
