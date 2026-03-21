import type { ServerConfig } from './types';
import { isTauri } from '@/lib/platform';

export interface ServerStoreAdapter {
  getServers(): Promise<ServerConfig[]>;
  saveServers(servers: ServerConfig[]): Promise<void>;
  getServerSession(
    serverId: string
  ): Promise<Record<string, unknown> | null>;
  saveServerSession(
    serverId: string,
    session: Record<string, unknown>
  ): Promise<void>;
  clearServerSession(serverId: string): Promise<void>;
}

const SERVERS_KEY = 'vb_servers';
const SESSION_PREFIX = 'vb_server_session_';

// --- Tauri adapter (tauri-plugin-store) ---

class TauriServerStore implements ServerStoreAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private storePromise: Promise<any> | null = null;

  private getStore() {
    if (!this.storePromise) {
      this.storePromise = import('@tauri-apps/plugin-store').then((m) =>
        m.load('servers.json', { defaults: {} })
      );
    }
    return this.storePromise;
  }

  async getServers(): Promise<ServerConfig[]> {
    const store = await this.getStore();
    return ((await store.get(SERVERS_KEY)) as ServerConfig[] | undefined) ?? [];
  }

  async saveServers(servers: ServerConfig[]): Promise<void> {
    const store = await this.getStore();
    await store.set(SERVERS_KEY, servers);
  }

  async getServerSession(
    serverId: string
  ): Promise<Record<string, unknown> | null> {
    const store = await this.getStore();
    return ((await store.get(SESSION_PREFIX + serverId)) as Record<string, unknown> | undefined) ?? null;
  }

  async saveServerSession(
    serverId: string,
    session: Record<string, unknown>
  ): Promise<void> {
    const store = await this.getStore();
    await store.set(SESSION_PREFIX + serverId, session);
  }

  async clearServerSession(serverId: string): Promise<void> {
    const store = await this.getStore();
    await store.delete(SESSION_PREFIX + serverId);
  }
}

// --- Browser adapter (localStorage) ---

class BrowserServerStore implements ServerStoreAdapter {
  async getServers(): Promise<ServerConfig[]> {
    try {
      const raw = localStorage.getItem(SERVERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async saveServers(servers: ServerConfig[]): Promise<void> {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
  }

  async getServerSession(
    serverId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const raw = localStorage.getItem(SESSION_PREFIX + serverId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async saveServerSession(
    serverId: string,
    session: Record<string, unknown>
  ): Promise<void> {
    localStorage.setItem(SESSION_PREFIX + serverId, JSON.stringify(session));
  }

  async clearServerSession(serverId: string): Promise<void> {
    localStorage.removeItem(SESSION_PREFIX + serverId);
  }
}

// --- Singleton ---

let instance: ServerStoreAdapter | null = null;

export function getServerStore(): ServerStoreAdapter {
  if (!instance) {
    instance = isTauri() ? new TauriServerStore() : new BrowserServerStore();
  }
  return instance;
}
