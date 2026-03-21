/**
 * Offline cache abstraction layer.
 * Tauri: uses @tauri-apps/plugin-store
 * Browser: uses IndexedDB
 */
import { isTauri } from '@/lib/platform';

export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

let adapterCache: Map<string, CacheAdapter> = new Map();

export async function getCacheAdapter(serverId: string): Promise<CacheAdapter> {
  const existing = adapterCache.get(serverId);
  if (existing) return existing;

  const adapter = isTauri()
    ? await createTauriAdapter(serverId)
    : createIndexedDbAdapter(serverId);

  adapterCache.set(serverId, adapter);
  return adapter;
}

async function createTauriAdapter(serverId: string): Promise<CacheAdapter> {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load(`cache-${serverId}.json`, { defaults: {} });

    return {
      async get<T>(key: string): Promise<T | undefined> {
        return (await store.get(key)) as T | undefined;
      },
      async set<T>(key: string, value: T): Promise<void> {
        await store.set(key, value);
      },
      async delete(key: string): Promise<void> {
        await store.delete(key);
      },
      async clear(): Promise<void> {
        await store.clear();
      },
    };
  } catch {
    // Fallback to IndexedDB if tauri-plugin-store not available
    return createIndexedDbAdapter(serverId);
  }
}

function createIndexedDbAdapter(serverId: string): CacheAdapter {
  const DB_NAME = `vb-cache-${serverId}`;
  const STORE_NAME = 'cache';

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      });
    },
    async set<T>(key: string, value: T): Promise<void> {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async delete(key: string): Promise<void> {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async clear(): Promise<void> {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}
