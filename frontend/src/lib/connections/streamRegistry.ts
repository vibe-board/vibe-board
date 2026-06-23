import type { StreamMeta } from './types';

/**
 * Tracks which task/attempt is currently "active" (being viewed) and answers
 * whether a given stream should stay open. Background ('active'-scope streams
 * whose ownerKey != activeKey) are closed by their hooks to free bandwidth /
 * e2ee-gateway queue capacity for the active task. 'global'-scope streams
 * (projects, approvals/notifications) are always active.
 *
 * Framework-agnostic singleton: set the active key from routing, subscribe
 * from stream hooks.
 */
class StreamRegistry {
  private activeKey: string | undefined = undefined;
  private subscribers = new Set<() => void>();

  /** Set the currently-active owner key (e.g. the viewed attempt's session id). */
  setActiveKey(key: string | undefined): void {
    if (this.activeKey === key) return;
    this.activeKey = key;
    for (const cb of this.subscribers) {
      try {
        cb();
      } catch {
        /* swallow subscriber errors */
      }
    }
  }

  getActiveKey(): string | undefined {
    return this.activeKey;
  }

  /** True if a stream with this meta should be open right now. */
  isActive(meta: StreamMeta | undefined): boolean {
    if (!meta) return true; // unclassified streams fail open
    if (meta.scope === 'global') return true;
    if (meta.ownerKey === undefined) return true; // fail open
    return meta.ownerKey === this.activeKey;
  }

  /** Subscribe to active-key changes. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}

export const streamRegistry = new StreamRegistry();
