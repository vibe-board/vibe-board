import { useSyncExternalStore } from 'react';
import { streamRegistry } from '@/lib/connections/streamRegistry';
import type { StreamMeta } from '@/lib/connections/types';

/**
 * Reactively report whether a stream with the given meta should be open.
 * Recomputes whenever the registry's active key changes.
 */
export function useStreamActive(meta: StreamMeta | undefined): boolean {
  return useSyncExternalStore(
    (cb) => streamRegistry.subscribe(cb),
    () => streamRegistry.isActive(meta)
  );
}
