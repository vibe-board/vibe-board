import {
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';

import type { SearchResult } from '@shared/types';
import { apiClient, type ApiError } from '../client';

// ── Query Key Factory ──────────────────────────────────────────────────────

export const searchKeys = {
  all: ['search'] as const,
  query: (q: string, repoIds?: string[], mode?: string) =>
    [...searchKeys.all, { q, repoIds, mode }] as const,
};

// ── Query Hooks ────────────────────────────────────────────────────────────

interface SearchParams {
  q: string;
  repoIds?: string[];
  mode?: 'content' | 'files';
}

export function useSearch(
  params: SearchParams,
  options?: Omit<
    UseQueryOptions<SearchResult[], ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<SearchResult[], ApiError>({
    queryKey: searchKeys.query(params.q, params.repoIds, params.mode),
    queryFn: () => {
      const queryParams: Record<string, string> = { q: params.q };
      if (params.repoIds?.length)
        queryParams.repo_ids = params.repoIds.join(',');
      if (params.mode) queryParams.mode = params.mode;
      return apiClient.get<SearchResult[]>('/search', queryParams);
    },
    enabled: !!params.q && params.q.length > 0,
    ...options,
  });
}
