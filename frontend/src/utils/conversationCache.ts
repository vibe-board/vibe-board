import type { PatchTypeWithKey } from '@/hooks/useConversationHistory/types';

const DB_NAME = 'vibe-kanban-conversation-cache';
const DB_VERSION = 2;
const STORE_NAME = 'process-entries';
const MAX_CACHED_PROCESSES = 200;

interface CachedProcessEntries {
  processId: string;
  attemptId: string;
  entries: PatchTypeWithKey[];
  totalCount: number;
  cachedAt: number;
  lastAccessedAt: number;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInitPromise = null;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        // Fresh install: create store with all indexes
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ['attemptId', 'processId'],
        });
        store.createIndex('attemptId', 'attemptId', { unique: false });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
        store.createIndex('lastAccessedAt', 'lastAccessedAt', {
          unique: false,
        });
      } else if (oldVersion < 2) {
        // Migrate from v1 to v2: add lastAccessedAt index
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const store = transaction.objectStore(STORE_NAME);
        if (!store.indexNames.contains('lastAccessedAt')) {
          store.createIndex('lastAccessedAt', 'lastAccessedAt', {
            unique: false,
          });
        }
      }
    };
  });

  return dbInitPromise;
}

/**
 * Get cached entries for a process. Updates lastAccessedAt for LRU tracking.
 */
export async function getCachedProcessEntries(
  attemptId: string,
  processId: string
): Promise<CachedProcessEntries | null> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const result = await new Promise<CachedProcessEntries | null>((resolve) => {
      const request = store.get([attemptId, processId]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        console.warn('Failed to get cached entries:', request.error);
        resolve(null);
      };
    });

    // Update lastAccessedAt (fire-and-forget)
    if (result) {
      touchCacheEntry(attemptId, processId);
    }

    return result;
  } catch (error) {
    console.warn('IndexedDB error in getCachedProcessEntries:', error);
    return null;
  }
}

/**
 * Update lastAccessedAt for an entry (fire-and-forget LRU touch)
 */
function touchCacheEntry(attemptId: string, processId: string): void {
  getDB()
    .then((db) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get([attemptId, processId]);
      request.onsuccess = () => {
        const entry = request.result;
        if (entry) {
          entry.lastAccessedAt = Date.now();
          store.put(entry);
        }
      };
    })
    .catch(() => {
      // Best-effort, ignore errors
    });
}

/**
 * Store entries for a process in the cache
 */
export async function setCachedProcessEntries(
  attemptId: string,
  processId: string,
  entries: PatchTypeWithKey[],
  totalCount: number
): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const now = Date.now();
    const cached: CachedProcessEntries = {
      processId,
      attemptId,
      entries,
      totalCount,
      cachedAt: now,
      lastAccessedAt: now,
    };

    await new Promise<void>((resolve) => {
      const request = store.put(cached);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Failed to cache entries:', request.error);
        resolve(); // Don't reject, caching is best-effort
      };
    });

    // LRU eviction (fire-and-forget)
    evictLRU();
  } catch (error) {
    console.warn('IndexedDB error in setCachedProcessEntries:', error);
  }
}

/**
 * Evict least recently used cache entries when over the limit
 */
async function evictLRU(): Promise<void> {
  try {
    const db = await getDB();

    // Use a separate readonly transaction for counting to avoid
    // the readwrite transaction auto-closing between await points.
    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });

    if (count <= MAX_CACHED_PROCESSES) return;

    const toDelete = count - MAX_CACHED_PROCESSES;

    // Use a fresh readwrite transaction for the cursor-based deletion.
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const index = tx.objectStore(STORE_NAME).index('lastAccessedAt');
      let deleted = 0;
      const request = index.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => resolve();
    });
  } catch (error) {
    console.warn('IndexedDB error in evictLRU:', error);
  }
}

/**
 * Clear cached entries for a single process
 */
export async function clearCachedProcessEntries(
  attemptId: string,
  processId: string
): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.delete([attemptId, processId]);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Failed to clear cached process entries:', request.error);
        resolve();
      };
    });
  } catch (error) {
    console.warn('IndexedDB error in clearCachedProcessEntries:', error);
  }
}

/**
 * Clear all cached entries for an attempt
 */
export async function clearCachedEntriesForAttempt(
  attemptId: string
): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('attemptId');

    return new Promise((resolve) => {
      const request = index.openCursor(IDBKeyRange.only(attemptId));

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => {
        console.warn('Failed to clear cached entries:', request.error);
        resolve();
      };
    });
  } catch (error) {
    console.warn('IndexedDB error in clearCachedEntriesForAttempt:', error);
  }
}

/**
 * Clear all cached entries
 */
export async function clearAllCachedEntries(): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Failed to clear all cached entries:', request.error);
        resolve();
      };
    });
  } catch (error) {
    console.warn('IndexedDB error in clearAllCachedEntries:', error);
  }
}

/**
 * Check if cached data is stale (older than maxAgeMs)
 */
export function isCacheStale(
  cachedAt: number,
  maxAgeMs: number = 60 * 60 * 1000
): boolean {
  return Date.now() - cachedAt > maxAgeMs;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  totalSizeEstimate: number;
}> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.count();
      request.onsuccess = () => {
        // Rough estimate: assume average 500 bytes per entry
        const count = request.result;
        resolve({
          totalEntries: count,
          totalSizeEstimate: count * 500,
        });
      };
      request.onerror = () => {
        console.warn('Failed to get cache stats:', request.error);
        resolve({ totalEntries: 0, totalSizeEstimate: 0 });
      };
    });
  } catch (error) {
    console.warn('IndexedDB error in getCacheStats:', error);
    return { totalEntries: 0, totalSizeEstimate: 0 };
  }
}
