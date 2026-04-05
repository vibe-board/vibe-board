import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedEntry } from '@shared/types';
import { apiClient } from '../client';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';

interface NormalizedEntryRecord {
  execution_id: string;
  entry_index: number;
  entry_json: string;
  inserted_at: string;
}

interface PaginatedNormalizedEntries {
  entries: NormalizedEntryRecord[];
  total_count: number;
  has_more: boolean;
}

function parseRecord(record: NormalizedEntryRecord): NormalizedEntry {
  try {
    return JSON.parse(record.entry_json) as NormalizedEntry;
  } catch {
    return {
      timestamp: null,
      entry_type: { type: 'system_message' },
      content: record.entry_json,
    } as NormalizedEntry;
  }
}

const PAGE_LIMIT = 200;

interface ConversationEntriesState {
  entries: NormalizedEntry[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

interface WsEntriesState {
  entries: (NormalizedEntry | null)[];
}

/**
 * Fetches paginated normalized conversation entries for an execution process.
 * Uses cursor-based pagination with `before` param (entry_index).
 * Provides `loadMore()` to fetch older entries when scrolling up.
 * Subscribes to live WS for real-time entries after initial fetch.
 */
export function useConversationEntries(processId: string | undefined) {
  const [state, setState] = useState<ConversationEntriesState>({
    entries: [],
    isLoading: false,
    hasMore: false,
    isLoadingMore: false,
    error: null,
  });

  // Track the smallest entry_index we have, used as cursor for loadMore
  const minEntryIndexRef = useRef<number | null>(null);
  const processIdRef = useRef<string | undefined>(undefined);

  // Track max entry index for WS cursor
  const maxEntryIndexRef = useRef<number>(-1);
  // Track initial REST entries with their entry_index for building padded WS initial data
  const initialRecordsRef = useRef<
    { entryIndex: number; entry: NormalizedEntry }[]
  >([]);
  // Track entries loaded via loadMore (older than WS range) separately
  const loadMoreEntriesRef = useRef<NormalizedEntry[]>([]);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  // Reset when processId changes
  useEffect(() => {
    if (processId !== processIdRef.current) {
      processIdRef.current = processId;
      minEntryIndexRef.current = null;
      maxEntryIndexRef.current = -1;
      initialRecordsRef.current = [];
      loadMoreEntriesRef.current = [];
      setInitialFetchDone(false);
      setState({
        entries: [],
        isLoading: !!processId,
        hasMore: false,
        isLoadingMore: false,
        error: null,
      });
    }
  }, [processId]);

  // Initial fetch (no cursor → gets last N entries)
  useEffect(() => {
    if (!processId) return;
    let cancelled = false;

    const fetchInitial = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const data = await apiClient.get<PaginatedNormalizedEntries>(
          `/execution-processes/${processId}/entries`,
          { limit: String(PAGE_LIMIT) },
        );
        if (cancelled) return;

        const records = Array.isArray(data.entries) ? data.entries : [];
        // Parse once and reuse
        const parsed = records.map((r) => ({
          record: r,
          entry: parseRecord(r),
        }));
        const entries = parsed.map((p) => p.entry);

        // Track the smallest entry_index for cursor pagination
        if (records.length > 0) {
          minEntryIndexRef.current = records[0].entry_index;
          maxEntryIndexRef.current = Math.max(
            ...records.map((r) => r.entry_index),
          );
        }

        // Store records with their entry_index for WS padded array
        initialRecordsRef.current = parsed.map((p) => ({
          entryIndex: p.record.entry_index,
          entry: p.entry,
        }));

        setState({
          entries,
          isLoading: false,
          hasMore: data.has_more,
          isLoadingMore: false,
          error: null,
        });
        setInitialFetchDone(true);
      } catch (e) {
        if (cancelled) return;
        setState({
          entries: [],
          isLoading: false,
          hasMore: false,
          isLoadingMore: false,
          error: e instanceof Error ? e.message : 'Failed to load entries',
        });
      }
    };

    fetchInitial();
    return () => {
      cancelled = true;
    };
  }, [processId]);

  // Build WS endpoint and initial data
  const wsEndpoint = useMemo(() => {
    if (!processId || !initialFetchDone) return undefined;
    return `/execution-processes/${processId}/normalized-logs-live/ws?after=${maxEntryIndexRef.current}`;
  }, [processId, initialFetchDone]);

  const wsInitialData = useCallback((): WsEntriesState => {
    const maxIdx = maxEntryIndexRef.current;
    const records = initialRecordsRef.current;
    if (maxIdx < 0 || records.length === 0) {
      return { entries: [] };
    }
    const padded: (NormalizedEntry | null)[] = new Array(maxIdx + 1).fill(null);
    for (const rec of records) {
      if (rec.entryIndex >= 0 && rec.entryIndex <= maxIdx) {
        padded[rec.entryIndex] = rec.entry;
      }
    }
    return { entries: padded };
  }, []);

  const wsEnabled = !!wsEndpoint && initialFetchDone;

  // On WS reconnect, re-fetch entries via REST to catch up on anything missed while disconnected
  const onWsReconnect = useCallback(async () => {
    if (!processId) return;
    try {
      const data = await apiClient.get<PaginatedNormalizedEntries>(
        `/execution-processes/${processId}/entries`,
        { limit: String(PAGE_LIMIT) },
      );
      const records = Array.isArray(data.entries) ? data.entries : [];
      if (records.length === 0) return;

      const parsed = records.map((r) => ({
        record: r,
        entry: parseRecord(r),
      }));

      // Update max entry index
      maxEntryIndexRef.current = Math.max(
        ...records.map((r) => r.entry_index),
      );

      // Update initial records for WS padded array
      initialRecordsRef.current = parsed.map((p) => ({
        entryIndex: p.record.entry_index,
        entry: p.entry,
      }));

      // Update min entry index for loadMore
      minEntryIndexRef.current = records[0].entry_index;

      // Update WS data with fresh padded array — this triggers mergedEntries recompute
      const maxIdx = maxEntryIndexRef.current;
      const padded: (NormalizedEntry | null)[] = new Array(maxIdx + 1).fill(null);
      for (const rec of initialRecordsRef.current) {
        if (rec.entryIndex >= 0 && rec.entryIndex <= maxIdx) {
          padded[rec.entryIndex] = rec.entry;
        }
      }
      setWsCatchupData({ entries: padded });
    } catch {
      // Silently fail — WS will continue working for new entries
    }
  }, [processId]);

  const [wsCatchupData, setWsCatchupData] = useState<WsEntriesState | null>(null);

  const wsOptions = useMemo(() => ({ onReconnect: onWsReconnect }), [onWsReconnect]);

  const {
    data: wsData,
    isConnected: wsConnected,
    error: wsError,
  } = useJsonPatchWsStream<WsEntriesState>(wsEndpoint, wsEnabled, wsInitialData, wsOptions);

  // Clear catchup data when WS data updates (WS patches take priority)
  useEffect(() => {
    if (wsData) setWsCatchupData(null);
  }, [wsData]);

  // Merge WS data into display entries
  const mergedEntries = useMemo(() => {
    // Use catchup data from REST re-fetch if WS data isn't available yet
    const activeData = wsData ?? wsCatchupData;
    if (!activeData?.entries) {
      return state.entries;
    }
    // Flatten the padded array, filtering nulls
    const flattened = activeData.entries.filter(
      (e): e is NormalizedEntry => e !== null,
    );
    // Only use WS data if it has entries; otherwise fall back to REST
    if (flattened.length > 0) {
      // Prepend loadMore entries (older than WS range) before WS entries
      return [...loadMoreEntriesRef.current, ...flattened];
    }
    return state.entries;
  }, [wsData, wsCatchupData, state.entries]);

  // loadMore: fetch entries before the oldest one we have
  const loadMore = useCallback(async () => {
    if (!processId || state.isLoadingMore || !state.hasMore) return;

    setState((prev) => ({ ...prev, isLoadingMore: true }));

    try {
      const params: Record<string, string> = {
        limit: String(PAGE_LIMIT),
      };
      if (minEntryIndexRef.current !== null) {
        params.before = String(minEntryIndexRef.current);
      }

      const data = await apiClient.get<PaginatedNormalizedEntries>(
        `/execution-processes/${processId}/entries`,
        params,
      );

      const newRecords = Array.isArray(data.entries) ? data.entries : [];
      const newEntries = newRecords.map(parseRecord);

      // Update cursor
      if (newRecords.length > 0) {
        minEntryIndexRef.current = newRecords[0].entry_index;
      }

      // Track loadMore entries separately for WS merge
      loadMoreEntriesRef.current = [...newEntries, ...loadMoreEntriesRef.current];

      // Prepend older entries
      setState((prev) => ({
        ...prev,
        entries: [...newEntries, ...prev.entries],
        hasMore: data.has_more,
        isLoadingMore: false,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isLoadingMore: false,
        error: e instanceof Error ? e.message : 'Failed to load more entries',
      }));
    }
  }, [processId, state.isLoadingMore, state.hasMore]);

  return {
    entries: mergedEntries,
    isLoading: state.isLoading,
    hasMore: state.hasMore,
    isLoadingMore: state.isLoadingMore,
    error: wsError ?? state.error,
    loadMore,
    isWsConnected: wsConnected,
  };
}
