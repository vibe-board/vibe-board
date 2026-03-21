import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useNetworkStatus } from './useNetworkStatus';
import { getCacheAdapter } from '@/lib/cache/offlineCache';

/**
 * Wraps useQuery with a write-through offline cache.
 * - On success: writes to cache (stale-while-revalidate)
 * - On error + offline: returns cached data as placeholder
 */
export function useOfflineQuery<T>(
  serverId: string | null,
  options: UseQueryOptions<T> & { cacheKey?: string }
): UseQueryResult<T> {
  const isOnline = useNetworkStatus();
  const queryClient = useQueryClient();
  const cacheKey = options.cacheKey ?? JSON.stringify(options.queryKey);

  const result = useQuery<T>({
    ...options,
    // When offline, don't retry
    retry: isOnline ? options.retry : false,
    // Extend stale time when offline
    staleTime: isOnline ? options.staleTime : Infinity,
  });

  // Write-through: save successful data to cache
  useEffect(() => {
    if (result.data !== undefined && serverId) {
      getCacheAdapter(serverId).then((adapter) => {
        adapter.set(cacheKey, result.data).catch(() => {
          // Silently fail cache writes
        });
      });
    }
  }, [result.data, serverId, cacheKey]);

  // If the query failed and we're offline, try to return cached data
  useEffect(() => {
    if (result.isError && !isOnline && serverId) {
      getCacheAdapter(serverId).then((adapter) => {
        adapter.get<T>(cacheKey).then((cached) => {
          if (cached !== undefined) {
            queryClient.setQueryData(options.queryKey, cached);
          }
        });
      });
    }
  }, [
    result.isError,
    isOnline,
    serverId,
    cacheKey,
    options.queryKey,
    queryClient,
  ]);

  return result;
}
