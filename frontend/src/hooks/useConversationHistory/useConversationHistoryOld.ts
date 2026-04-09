import {
  CommandExitStatus,
  ExecutionProcess,
  ExecutionProcessStatus,
  NormalizedEntry,
  PatchType,
  TokenUsageInfo,
  ToolStatus,
} from 'shared/types';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { useEntries } from '@/contexts/EntriesContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamJsonPatchEntries } from '@/utils/streamJsonPatchEntries';
import { executionProcessesApi } from '@/lib/api';
import {
  getCachedProcessEntries,
  setCachedProcessEntries,
  clearCachedProcessEntries,
  isCacheStale,
} from '@/utils/conversationCache';
import type {
  AddEntryType,
  ExecutionProcessState,
  ExecutionProcessStateStore,
  PatchTypeWithKey,
  ScrollIntent,
  UseConversationHistoryParams,
  UseConversationHistoryResult,
} from './types';
import {
  makeLoadingPatch,
  MAX_IN_MEMORY_ENTRIES,
  MIN_INITIAL_ENTRIES,
  nextActionPatch,
  taskDurationPatch,
} from './constants';

function parseEntryJson(entryJson: string): PatchType | null {
  try {
    // entry_json in the DB stores a raw NormalizedEntry (without the
    // PatchType envelope).  Wrap it so downstream code that checks
    // patch.type === "NORMALIZED_ENTRY" works correctly.
    const content = JSON.parse(entryJson) as NormalizedEntry;
    return { type: 'NORMALIZED_ENTRY', content };
  } catch {
    return null;
  }
}

export const useConversationHistoryOld = ({
  attempt,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const { executionProcessesVisible: executionProcessesRaw } =
    useExecutionProcessesContext();
  const { setTokenUsageInfo } = useEntries();
  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const streamingProcessIdsRef = useRef<Set<string>>(new Set());

  // --- Declarative state (single source of truth) ---
  const [entries, setEntries] = useState<PatchTypeWithKey[]>([]);
  const [scrollIntent, setScrollIntent] = useState<ScrollIntent>('none');
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // --- Refs for stable loadMore (read inside callback, avoid closure staleness) ---
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const hasReceivedRealDataRef = useRef(false);

  const loadedProcessIds = useRef<Set<string>>(new Set());
  // Tracks processes evicted from memory during streaming — these need to be
  // re-loadable when the user scrolls back up.
  const evictedProcessIds = useRef<Set<string>>(new Set());
  const allHistoricProcesses = useRef<ExecutionProcess[]>([]);
  const preloadedEntries = useRef<
    Map<string, ExecutionProcessStateStore[string]>
  >(new Map());
  const isPreloadingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Tracks the latest flat entries array length. Updated in emitState after
  // every setEntries call.
  const entriesLengthRef = useRef(0);
  // How many items were prepended in the last loadMore call. The component
  // reads this to do manual scroll compensation after prepend.
  const lastPrependCountRef = useRef(0);

  // Refs for stable loadMore — stores latest function versions so the
  // empty-deps useCallback always calls the current implementation.
  const emitStateRef = useRef<
    (
      state: ExecutionProcessStateStore,
      addType: AddEntryType,
      protectedId?: string
    ) => void
  >(() => {});
  const preloadNextBatchRef = useRef<() => Promise<void>>(async () => {});
  const loadEntriesRef = useRef<
    (ep: ExecutionProcess) => Promise<{
      entries: PatchTypeWithKey[];
      totalCount: number;
      hasMore: boolean;
      minEntryIndex: number | undefined;
    }>
  >(async () => ({
    entries: [],
    totalCount: 0,
    hasMore: false,
    minEntryIndex: undefined,
  }));
  // When true, loadMore will loop until hasMore is false or wantMore is cleared.
  // Set by the consumer (VirtualizedList) when user is at top.
  const wantMoreRef = useRef(false);

  // Keep hasMoreRef in sync
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current;
    mutator(state);
  };

  // Keep executionProcesses up to date
  useEffect(() => {
    executionProcesses.current = executionProcessesRaw.filter(
      (ep) =>
        ep.run_reason === 'setupscript' ||
        ep.run_reason === 'cleanupscript' ||
        ep.run_reason === 'archivescript' ||
        ep.run_reason === 'codingagent'
    );
  }, [executionProcessesRaw]);

  const loadEntriesForHistoricExecutionProcess = useCallback(
    async (
      executionProcess: ExecutionProcess
    ): Promise<{
      entries: PatchTypeWithKey[];
      totalCount: number;
      hasMore: boolean;
      minEntryIndex: number | undefined;
    }> => {
      const attemptId = attempt.id;
      const processId = executionProcess.id;

      // Try IndexedDB cache first
      const cached = await getCachedProcessEntries(attemptId, processId);
      if (cached && !isCacheStale(cached.cachedAt)) {
        return {
          entries: cached.entries,
          totalCount: cached.entries.length,
          hasMore: false,
          minEntryIndex: undefined,
        };
      }

      // Fetch via REST (tail-first: last 50 entries)
      let result;
      try {
        result = await executionProcessesApi.getEntries(
          processId,
          undefined,
          50
        );
      } catch (err) {
        console.debug(
          `Could not load entries for historic execution process ${processId}`,
          err
        );
        return {
          entries: [],
          totalCount: 0,
          hasMore: false,
          minEntryIndex: undefined,
        };
      }

      const entriesWithKey: PatchTypeWithKey[] = [];
      let minEntryIndex: number | undefined;
      for (const record of result.entries) {
        const parsed = parseEntryJson(record.entry_json);
        if (parsed) {
          entriesWithKey.push(
            patchWithKey(parsed, processId, record.entry_index)
          );
          if (
            minEntryIndex === undefined ||
            record.entry_index < minEntryIndex
          ) {
            minEntryIndex = record.entry_index;
          }
        }
      }

      // Write to IndexedDB cache (fire-and-forget), only for completed/failed processes.
      // Skip killed processes: the backend log flush may still be in progress,
      // so caching now could persist incomplete data.
      if (
        executionProcess.status !== ExecutionProcessStatus.running &&
        executionProcess.status !== ExecutionProcessStatus.killed
      ) {
        setCachedProcessEntries(
          attemptId,
          processId,
          entriesWithKey,
          result.total_count
        );
      }

      return {
        entries: entriesWithKey,
        totalCount: result.total_count,
        hasMore: result.has_more,
        minEntryIndex,
      };
    },
    [attempt.id]
  );
  loadEntriesRef.current = loadEntriesForHistoricExecutionProcess;

  const getLiveExecutionProcess = (
    executionProcessId: string
  ): ExecutionProcess | undefined => {
    return executionProcesses?.current.find(
      (executionProcess) => executionProcess.id === executionProcessId
    );
  };

  const patchWithKey = (
    patch: PatchType,
    executionProcessId: string,
    index: number | 'user'
  ) => {
    return {
      ...patch,
      patchKey: `${executionProcessId}:${index}`,
      executionProcessId,
    };
  };

  const flattenEntries = (
    executionProcessState: ExecutionProcessStateStore
  ): PatchTypeWithKey[] => {
    return Object.values(executionProcessState)
      .filter(
        (p) =>
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentFollowUpRequest' ||
          p.executionProcess.executor_action.typ.type ===
            'CodingAgentInitialRequest' ||
          p.executionProcess.executor_action.typ.type === 'ReviewRequest'
      )
      .sort(
        (a, b) =>
          new Date(
            a.executionProcess.created_at as unknown as string
          ).getTime() -
          new Date(b.executionProcess.created_at as unknown as string).getTime()
      )
      .flatMap((p) => p.entries);
  };

  const getActiveAgentProcesses = (): ExecutionProcess[] => {
    return (
      executionProcesses?.current.filter(
        (p) =>
          p.status === ExecutionProcessStatus.running &&
          p.run_reason !== 'devserver'
      ) ?? []
    );
  };

  const flattenEntriesForEmit = useCallback(
    (executionProcessState: ExecutionProcessStateStore): PatchTypeWithKey[] => {
      // Flags to control Next Action bar emit
      let hasPendingApproval = false;
      let hasRunningProcess = false;
      let lastProcessFailedOrKilled = false;
      let needsSetup = false;
      let setupHelpText: string | undefined;
      let latestTokenUsageInfo: TokenUsageInfo | null = null;

      // Create user messages + tool calls for setup/cleanup scripts
      const allEntries = Object.values(executionProcessState)
        .sort(
          (a, b) =>
            new Date(
              a.executionProcess.created_at as unknown as string
            ).getTime() -
            new Date(
              b.executionProcess.created_at as unknown as string
            ).getTime()
        )
        .flatMap((p, index) => {
          const entries: PatchTypeWithKey[] = [];
          if (
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentInitialRequest' ||
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentFollowUpRequest' ||
            p.executionProcess.executor_action.typ.type === 'ReviewRequest'
          ) {
            // New user message
            const actionType = p.executionProcess.executor_action.typ;
            const userNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'user_message',
              },
              content: actionType.prompt,
              timestamp: null,
            };
            const userPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: userNormalizedEntry,
            };
            const userPatchTypeWithKey = patchWithKey(
              userPatch,
              p.executionProcess.id,
              'user'
            );
            entries.push(userPatchTypeWithKey);

            // Extract latest token usage info before filtering
            const tokenUsageEntry = p.entries.findLast(
              (e) =>
                e.type === 'NORMALIZED_ENTRY' &&
                e.content.entry_type.type === 'token_usage_info'
            );
            if (tokenUsageEntry?.type === 'NORMALIZED_ENTRY') {
              latestTokenUsageInfo = tokenUsageEntry.content
                .entry_type as TokenUsageInfo;
            }

            // Remove user messages (replaced with custom one)
            const filteredEntries = p.entries.filter(
              (e) =>
                e.type !== 'NORMALIZED_ENTRY' ||
                e.content.entry_type.type !== 'user_message'
            );

            const hasPendingApprovalEntry = filteredEntries.some((entry) => {
              if (entry.type !== 'NORMALIZED_ENTRY') return false;
              const entryType = entry.content.entry_type;
              return (
                entryType.type === 'tool_use' &&
                entryType.status.status === 'pending_approval'
              );
            });

            if (hasPendingApprovalEntry) {
              hasPendingApproval = true;
            }

            entries.push(...filteredEntries);

            const liveProcessStatus = getLiveExecutionProcess(
              p.executionProcess.id
            )?.status;
            const isProcessRunning =
              liveProcessStatus === ExecutionProcessStatus.running;
            const processFailedOrKilled =
              liveProcessStatus === ExecutionProcessStatus.failed ||
              liveProcessStatus === ExecutionProcessStatus.killed;

            if (isProcessRunning) {
              hasRunningProcess = true;
            }

            if (
              processFailedOrKilled &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;

              // Check if this failed process has a SetupRequired entry
              const hasSetupRequired = filteredEntries.some((entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false;
                if (
                  entry.content.entry_type.type === 'error_message' &&
                  entry.content.entry_type.error_type.type === 'setup_required'
                ) {
                  setupHelpText = entry.content.content;
                  return true;
                }
                return false;
              });

              if (hasSetupRequired) {
                needsSetup = true;
              }
            }

            if (isProcessRunning && !hasPendingApprovalEntry) {
              entries.push(makeLoadingPatch(p.executionProcess.id));
            }

            // Add duration entry for completed coding agent processes
            const liveProcess = getLiveExecutionProcess(p.executionProcess.id);
            if (!isProcessRunning && liveProcess?.completed_at) {
              const startMs = new Date(
                liveProcess.started_at as string
              ).getTime();
              const endMs = new Date(
                liveProcess.completed_at as string
              ).getTime();
              const durationSeconds = (endMs - startMs) / 1000;
              entries.push(
                taskDurationPatch(
                  p.executionProcess.id,
                  liveProcess.started_at as string,
                  liveProcess.completed_at as string,
                  durationSeconds
                )
              );
            }
          } else if (
            p.executionProcess.executor_action.typ.type === 'ScriptRequest'
          ) {
            // Add setup and cleanup script as a tool call
            let toolName = '';
            switch (p.executionProcess.executor_action.typ.context) {
              case 'SetupScript':
                toolName = 'Setup Script';
                break;
              case 'CleanupScript':
                toolName = 'Cleanup Script';
                break;
              case 'ArchiveScript':
                toolName = 'Archive Script';
                break;
              case 'ToolInstallScript':
                toolName = 'Tool Install Script';
                break;
              default:
                return [];
            }

            const executionProcess = getLiveExecutionProcess(
              p.executionProcess.id
            );

            if (executionProcess?.status === ExecutionProcessStatus.running) {
              hasRunningProcess = true;
            }

            if (
              (executionProcess?.status === ExecutionProcessStatus.failed ||
                executionProcess?.status === ExecutionProcessStatus.killed) &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;
            }

            const exitCode = Number(executionProcess?.exit_code) || 0;
            const exit_status: CommandExitStatus | null =
              executionProcess?.status === 'running'
                ? null
                : {
                    type: 'exit_code',
                    code: exitCode,
                  };

            const toolStatus: ToolStatus =
              executionProcess?.status === ExecutionProcessStatus.running
                ? { status: 'created' }
                : exitCode === 0
                  ? { status: 'success' }
                  : { status: 'failed' };

            const output = p.entries.map((line) => line.content).join('\n');

            const toolNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'tool_use',
                tool_name: toolName,
                action_type: {
                  action: 'command_run',
                  command: p.executionProcess.executor_action.typ.script,
                  result: {
                    output,
                    exit_status,
                  },
                },
                status: toolStatus,
              },
              content: toolName,
              timestamp: null,
            };
            const toolPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: toolNormalizedEntry,
            };
            const toolPatchWithKey: PatchTypeWithKey = patchWithKey(
              toolPatch,
              p.executionProcess.id,
              0
            );

            entries.push(toolPatchWithKey);
          }

          return entries;
        });

      // Emit the next action bar if no process running
      if (!hasRunningProcess && !hasPendingApproval) {
        allEntries.push(
          nextActionPatch(
            lastProcessFailedOrKilled,
            Object.keys(executionProcessState).length,
            needsSetup,
            setupHelpText
          )
        );
      }

      // Update token usage info in context
      setTokenUsageInfo(latestTokenUsageInfo);

      return allEntries;
    },
    [setTokenUsageInfo]
  );

  /**
   * Central state emitter. Replaces the old callback-based `emitEntries`.
   * Runs eviction, flattens entries, computes hasMore, and sets all React state
   * in one go — eliminating the dual-data-source / callback-sync problems.
   */
  const emitState = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      protectedId?: string
    ) => {
      // --- Eviction ---
      const totalEntries = Object.values(executionProcessState).reduce(
        (sum, p) => sum + p.entries.length,
        0
      );
      let _evictedCount = 0;
      if (totalEntries > MAX_IN_MEMORY_ENTRIES) {
        const ascending = (
          [, a]: [string, ExecutionProcessState],
          [, b]: [string, ExecutionProcessState]
        ) =>
          new Date(
            a.executionProcess.created_at as unknown as string
          ).getTime() -
          new Date(
            b.executionProcess.created_at as unknown as string
          ).getTime();
        // Always evict oldest processes first (ascending by created_at).
        // This preserves the most recently added data regardless of whether
        // it was appended (live) or prepended (historic/pagination).
        const sorted = Object.entries(executionProcessState).sort(ascending);
        let remaining = totalEntries;
        for (const [id, proc] of sorted) {
          if (remaining <= MAX_IN_MEMORY_ENTRIES) break;
          // Never evict the process the user is actively paginating through.
          if (protectedId && id === protectedId) continue;
          const live = getLiveExecutionProcess(id);
          if (live?.status === ExecutionProcessStatus.running) continue;
          remaining -= proc.entries.length;
          _evictedCount += proc.entries.length;
          delete executionProcessState[id];
          // Track as evicted so loadMore can re-load them if user scrolls back.
          // Do NOT remove from loadedProcessIds — that would cause an infinite
          // load→evict→load cycle because hasMore would re-count them.
          evictedProcessIds.current.add(id);
        }
      }

      // --- Flatten ---
      const newEntries = flattenEntriesForEmit(executionProcessState);

      // --- Detect plan addType override ---
      let effectiveAddType = addEntryType;
      if (newEntries.length > 0) {
        const lastEntry = newEntries[newEntries.length - 1];
        if (
          lastEntry.type === 'NORMALIZED_ENTRY' &&
          lastEntry.content.entry_type.type === 'tool_use' &&
          lastEntry.content.entry_type.tool_name === 'ExitPlanMode'
        ) {
          effectiveAddType = 'plan';
        }
      }

      // --- Compute hasMore AFTER eviction ---
      // Never-loaded processes (haven't been fetched yet)
      const stillRemaining = allHistoricProcesses.current.filter(
        (p) => !loadedProcessIds.current.has(p.id)
      );
      // Evicted processes that are no longer in memory but were previously loaded
      const hasEvicted = evictedProcessIds.current.size > 0;
      // Entry-level pagination: any displayed process with more entries to load
      const hasEntryLevelMore = Object.values(executionProcessState).some(
        (p) => p.hasMoreEntries
      );
      const newHasMore =
        stillRemaining.length > 0 || hasEvicted || hasEntryLevelMore;
      setHasMore(newHasMore);
      hasMoreRef.current = newHasMore;

      // --- Compute scrollIntent ---
      if (effectiveAddType === 'initial') {
        setScrollIntent('bottom-instant');
      } else if (
        effectiveAddType === 'running' ||
        effectiveAddType === 'plan'
      ) {
        // Only scroll to bottom if not in pagination mode. When the user is
        // scrolling up (loadMore sets scrollIntent to 'none'), emitState
        // from a WS update must not fight with the user's scroll position —
        // doing so causes visible flicker and jump-to-bottom.
        setScrollIntent((prev) => (prev === 'none' ? 'none' : 'bottom-smooth'));
      } else {
        // 'historic' — no scroll change, component handles scroll compensation
        setScrollIntent('none');
      }

      // --- Set entries (single source of truth) ---
      setEntries(newEntries);
      entriesLengthRef.current = newEntries.length;

      // --- initialLoading logic ---
      if (!hasReceivedRealDataRef.current && effectiveAddType === 'initial') {
        const onlySynthetic = newEntries.every(
          (e) =>
            e.type === 'NORMALIZED_ENTRY' &&
            e.content?.entry_type?.type === 'next_action'
        );
        if (!onlySynthetic && newEntries.length > 0) {
          hasReceivedRealDataRef.current = true;
          setInitialLoading(false);
        }
      }
      // For running/plan/historic entries, dismiss overlay immediately
      if (
        !hasReceivedRealDataRef.current &&
        (effectiveAddType === 'running' || effectiveAddType === 'historic') &&
        newEntries.length > 0
      ) {
        hasReceivedRealDataRef.current = true;
        setInitialLoading(false);
      }
    },
    [flattenEntriesForEmit]
  );
  emitStateRef.current = emitState;

  // This emits its own events as they are streamed
  const loadRunningAndEmit = useCallback(
    async (executionProcess: ExecutionProcess): Promise<void> => {
      // ScriptRequest still uses raw-logs WS (unchanged)
      if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
        const url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
        return new Promise((resolve, reject) => {
          const controller = streamJsonPatchEntries<PatchType>(url, {
            onEntries(entries) {
              const patchesWithKey = entries.map((entry, index) =>
                patchWithKey(entry, executionProcess.id, index)
              );
              mergeIntoDisplayed((state) => {
                state[executionProcess.id] = {
                  executionProcess,
                  entries: patchesWithKey,
                };
              });
              emitState(displayedExecutionProcesses.current, 'running');
            },
            onFinished: () => {
              emitState(displayedExecutionProcesses.current, 'running');
              controller.close();
              resolve();
            },
            onError: () => {
              controller.close();
              reject();
            },
          });
        });
      }

      // Normalized logs: WS replay full history + live updates
      const url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;

      return new Promise<void>((resolve) => {
        const controller = streamJsonPatchEntries<PatchType>(url, {
          reconnect: {
            maxRetries: 10,
            getReconnectUrl: (maxIndex) =>
              `/api/execution-processes/${executionProcess.id}/normalized-logs-live/ws?after=${maxIndex}`,
          },
          onEntries(allEntries) {
            const patchesWithKey = (allEntries as (PatchType | null)[])
              .map((entry, index) =>
                entry ? patchWithKey(entry, executionProcess.id, index) : null
              )
              .filter(Boolean) as PatchTypeWithKey[];

            let minEntryIndex: number | undefined;
            for (const e of patchesWithKey) {
              const idx = parseInt(e.patchKey.split(':').pop()!, 10);
              if (!Number.isNaN(idx)) {
                if (minEntryIndex === undefined || idx < minEntryIndex) {
                  minEntryIndex = idx;
                }
              }
            }

            const hasMoreEntries =
              minEntryIndex !== undefined && minEntryIndex > 0;

            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: patchesWithKey,
                hasMoreEntries,
                minEntryIndex,
              };
            });
            emitState(displayedExecutionProcesses.current, 'running');
          },
          onFinished: () => {
            emitState(displayedExecutionProcesses.current, 'running');
            controller.close();
            resolve();
          },
          onError: () => {
            // Don't close the controller here — ws.onerror fires before
            // ws.onclose in browsers, and closing would prevent reconnection.
            // The reconnect logic in onclose handles transient errors.
          },
        });
      });
    },
    [emitState]
  );

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  const loadRunningAndEmitWithBackoff = useCallback(
    async (executionProcess: ExecutionProcess) => {
      for (let i = 0; i < 20; i++) {
        if (!isMountedRef.current) break;
        try {
          await loadRunningAndEmit(executionProcess);
          break;
        } catch (_) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    },
    [loadRunningAndEmit]
  );

  // Get all historic (non-running) processes in reverse chronological order
  const getHistoricProcesses = useCallback((): ExecutionProcess[] => {
    if (!executionProcesses?.current) return [];
    return [...executionProcesses.current]
      .filter((ep) => ep.status !== ExecutionProcessStatus.running)
      .reverse();
  }, [executionProcesses]);

  // Preload next batch into cache (non-blocking)
  const preloadNextBatch = useCallback(async () => {
    if (isPreloadingRef.current) return;

    const remainingProcesses = allHistoricProcesses.current.filter(
      (p) =>
        !loadedProcessIds.current.has(p.id) &&
        !preloadedEntries.current.has(p.id)
    );

    if (remainingProcesses.length === 0) return;

    isPreloadingRef.current = true;

    // Preload up to MIN_INITIAL_ENTRIES worth of content
    let entriesLoaded = 0;
    for (const executionProcess of remainingProcesses) {
      const { entries: entriesWithKey } =
        await loadEntriesForHistoricExecutionProcess(executionProcess);

      preloadedEntries.current.set(executionProcess.id, {
        executionProcess,
        entries: entriesWithKey,
      });
      entriesLoaded += entriesWithKey.length;

      if (entriesLoaded >= MIN_INITIAL_ENTRIES) {
        break;
      }
    }

    isPreloadingRef.current = false;
  }, [loadEntriesForHistoricExecutionProcess]);
  preloadNextBatchRef.current = preloadNextBatch;

  const loadInitialEntries =
    useCallback(async (): Promise<ExecutionProcessStateStore> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};

      const historicProcesses = getHistoricProcesses();
      // Store all historic processes for later pagination
      allHistoricProcesses.current = historicProcesses;
      // Clear preloaded cache
      preloadedEntries.current.clear();

      for (const executionProcess of historicProcesses) {
        const {
          entries: entriesWithKey,
          totalCount,
          hasMore: hasMoreEntries,
          minEntryIndex,
        } = await loadEntriesForHistoricExecutionProcess(executionProcess);

        localDisplayedExecutionProcesses[executionProcess.id] = {
          executionProcess,
          entries: entriesWithKey,
          totalCount,
          hasMoreEntries,
          minEntryIndex,
        };
        loadedProcessIds.current.add(executionProcess.id);

        if (
          flattenEntries(localDisplayedExecutionProcesses).length >
          MIN_INITIAL_ENTRIES
        ) {
          break;
        }
      }

      // Check if there are more processes to load or entry-level pagination
      const remainingProcesses = historicProcesses.filter(
        (p) => !loadedProcessIds.current.has(p.id)
      );
      const hasEntryPagination = Object.values(
        localDisplayedExecutionProcesses
      ).some((p) => p.hasMoreEntries);
      const initialHasMore =
        remainingProcesses.length > 0 || hasEntryPagination;
      setHasMore(initialHasMore);
      hasMoreRef.current = initialHasMore;

      // Start preloading next batch in background
      if (remainingProcesses.length > 0) {
        preloadNextBatch();
      }

      return localDisplayedExecutionProcesses;
    }, [
      getHistoricProcesses,
      preloadNextBatch,
      loadEntriesForHistoricExecutionProcess,
    ]);

  // Helper: build flat entries for a single historic process (for prepend).
  // Produces the same output as flattenEntriesForEmit for one CodingAgent process,
  // but without the global side-effects (nextActionPatch, tokenUsageInfo, etc.).
  const flattenProcessForPrepend = useCallback(
    (proc: ExecutionProcessState): PatchTypeWithKey[] => {
      const ep = proc.executionProcess;
      const actionType = ep.executor_action.typ.type;
      if (
        actionType !== 'CodingAgentInitialRequest' &&
        actionType !== 'CodingAgentFollowUpRequest' &&
        actionType !== 'ReviewRequest'
      ) {
        return []; // ScriptRequest processes are handled differently
      }

      const flat: PatchTypeWithKey[] = [];

      // Synthetic user message
      const userNormalizedEntry: NormalizedEntry = {
        entry_type: { type: 'user_message' },
        content: ep.executor_action.typ.prompt,
        timestamp: null,
      };
      flat.push(
        patchWithKey(
          { type: 'NORMALIZED_ENTRY', content: userNormalizedEntry },
          ep.id,
          'user'
        )
      );

      // Entries with user_message filtered out
      const filtered = proc.entries.filter(
        (e) =>
          e.type !== 'NORMALIZED_ENTRY' ||
          e.content.entry_type.type !== 'user_message'
      );
      flat.push(...filtered);

      // Duration entry for completed processes
      const live = getLiveExecutionProcess(ep.id);
      if (
        live?.status !== ExecutionProcessStatus.running &&
        live?.completed_at
      ) {
        const startMs = new Date(live.started_at as string).getTime();
        const endMs = new Date(live.completed_at as string).getTime();
        flat.push(
          taskDurationPatch(
            ep.id,
            live.started_at as string,
            live.completed_at as string,
            (endMs - startMs) / 1000
          )
        );
      }

      return flat;
    },
    []
  );

  // Recompute hasMore from current state. Call after mutating displayedExecutionProcesses.
  const recomputeHasMore = useCallback(() => {
    const stillRemaining = allHistoricProcesses.current.filter(
      (p) => !loadedProcessIds.current.has(p.id)
    );
    const hasEvicted = evictedProcessIds.current.size > 0;
    const hasEntryLevelMore = Object.values(
      displayedExecutionProcesses.current
    ).some((p) => p.hasMoreEntries);
    const newHasMore =
      stillRemaining.length > 0 || hasEvicted || hasEntryLevelMore;
    setHasMore(newHasMore);
    hasMoreRef.current = newHasMore;
  }, []);

  // Load more historic entries — STABLE reference (empty deps).
  // Directly prepends to entries state, setting lastPrependCountRef
  // for scroll compensation. Bypasses emitState to avoid full-rebuild ambiguity.
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      // Yield to let React render the loading state before we proceed.
      await new Promise((r) => setTimeout(r, 0));

      // Check for entry-level pagination within existing displayed processes.
      // Skip processes with active live WS.
      const processWithMore = Object.values(displayedExecutionProcesses.current)
        .filter((p) => {
          if (!p.hasMoreEntries || p.minEntryIndex === undefined) return false;
          return true;
        })
        .sort(
          (a, b) =>
            new Date(
              b.executionProcess.created_at as unknown as string
            ).getTime() -
            new Date(
              a.executionProcess.created_at as unknown as string
            ).getTime()
        )[0];

      if (processWithMore) {
        // --- Entry-level pagination ---
        let result;
        try {
          result = await executionProcessesApi.getEntries(
            processWithMore.executionProcess.id,
            processWithMore.minEntryIndex,
            50
          );
        } catch (err) {
          console.debug(
            `Could not load entries for process ${processWithMore.executionProcess.id}`,
            err
          );
          mergeIntoDisplayed((state) => {
            if (state[processWithMore.executionProcess.id]) {
              state[processWithMore.executionProcess.id].hasMoreEntries = false;
              state[processWithMore.executionProcess.id].minEntryIndex =
                undefined;
            }
          });
          recomputeHasMore();
          return;
        }

        if (!result) return;

        let newMinIndex = processWithMore.minEntryIndex!;
        const newRawEntries: PatchTypeWithKey[] = [];
        for (const record of result.entries) {
          const parsed = parseEntryJson(record.entry_json);
          if (parsed) {
            newRawEntries.push(
              patchWithKey(
                parsed,
                processWithMore.executionProcess.id,
                record.entry_index
              )
            );
            if (record.entry_index < newMinIndex) {
              newMinIndex = record.entry_index;
            }
          }
        }

        // Update the ref (so future emitState('running') includes this data)
        mergeIntoDisplayed((state) => {
          if (state[processWithMore.executionProcess.id]) {
            state[processWithMore.executionProcess.id].entries = [
              ...newRawEntries,
              ...state[processWithMore.executionProcess.id].entries,
            ];
            state[processWithMore.executionProcess.id].hasMoreEntries =
              result.has_more;
            state[processWithMore.executionProcess.id].minEntryIndex =
              result.has_more ? newMinIndex : undefined;
          }
        });

        if (newRawEntries.length > 0) {
          // Filter out user_message entries (already represented by synthetic user msg)
          const toPrepend = newRawEntries.filter(
            (e) =>
              e.type !== 'NORMALIZED_ENTRY' ||
              e.content.entry_type.type !== 'user_message'
          );

          if (toPrepend.length > 0) {
            // Reset scrollIntent so followOutput stops forcing scroll-to-bottom.
            setScrollIntent('none');
            // Deduplicate: a concurrent emitState('running') may have already
            // rebuilt entries from the ref (which we just mutated above), so
            // `prev` might already contain these entries.
            setEntries((prev) => {
              const existingKeys = new Set(prev.map((e) => e.patchKey));
              const unique = toPrepend.filter(
                (e) => !existingKeys.has(e.patchKey)
              );
              if (unique.length === 0) return prev;

              // Find the correct insertion point: the first non-user
              // entry belonging to this process. New entries go right
              // before it (i.e. after the synthetic user message).
              const pid = processWithMore.executionProcess.id;
              let insertIdx = -1;
              let userMsgIdx = -1;
              for (let i = 0; i < prev.length; i++) {
                if (prev[i].executionProcessId !== pid) continue;
                if (prev[i].patchKey.endsWith(':user')) {
                  userMsgIdx = i;
                } else {
                  insertIdx = i;
                  break;
                }
              }
              // Fallback: after user message, or position 0 if neither found
              if (insertIdx === -1) {
                insertIdx = userMsgIdx !== -1 ? userMsgIdx + 1 : 0;
              }

              lastPrependCountRef.current = unique.length;
              const next = [
                ...prev.slice(0, insertIdx),
                ...unique,
                ...prev.slice(insertIdx),
              ];
              entriesLengthRef.current = next.length;
              return next;
            });
          }
        } else {
          // All entries failed to parse — advance cursor
          const rawMin = result.entries.reduce(
            (min, r) => Math.min(min, r.entry_index),
            Infinity
          );
          mergeIntoDisplayed((state) => {
            if (state[processWithMore.executionProcess.id]) {
              state[processWithMore.executionProcess.id].hasMoreEntries =
                result.has_more;
              state[processWithMore.executionProcess.id].minEntryIndex =
                result.has_more && rawMin < Infinity ? rawMin : undefined;
            }
          });
        }

        recomputeHasMore();
      } else {
        // --- Process-level pagination ---
        let procState: ExecutionProcessState | null = null;

        // Try preloaded first
        const preloaded = Array.from(preloadedEntries.current.values());
        if (preloaded.length > 0) {
          procState = preloaded[0];
          preloadedEntries.current.delete(procState.executionProcess.id);
        } else {
          // Load one process synchronously
          let nextProcess = allHistoricProcesses.current.find(
            (p) => !loadedProcessIds.current.has(p.id)
          );
          if (!nextProcess && evictedProcessIds.current.size > 0) {
            nextProcess = allHistoricProcesses.current.find(
              (p) =>
                evictedProcessIds.current.has(p.id) &&
                !displayedExecutionProcesses.current[p.id]
            );
          }
          if (!nextProcess) {
            setHasMore(false);
            hasMoreRef.current = false;
            return;
          }

          const {
            entries: entriesWithKey,
            totalCount,
            hasMore: hasMoreEntries,
            minEntryIndex,
          } = await loadEntriesRef.current(nextProcess);

          procState = {
            executionProcess: nextProcess,
            entries: entriesWithKey,
            totalCount,
            hasMoreEntries,
            minEntryIndex,
          };
        }

        // Update the ref
        mergeIntoDisplayed((state) => {
          state[procState!.executionProcess.id] = procState!;
        });
        loadedProcessIds.current.add(procState.executionProcess.id);
        evictedProcessIds.current.delete(procState.executionProcess.id);

        // Build flat entries for this process and prepend
        const toPrepend = flattenProcessForPrepend(procState);
        if (toPrepend.length > 0) {
          // Reset scrollIntent so followOutput stops forcing scroll-to-bottom.
          setScrollIntent('none');
          setEntries((prev) => {
            const existingKeys = new Set(prev.map((e) => e.patchKey));
            const unique = toPrepend.filter(
              (e) => !existingKeys.has(e.patchKey)
            );
            if (unique.length === 0) return prev;
            lastPrependCountRef.current = unique.length;
            const next = [...unique, ...prev];
            entriesLengthRef.current = next.length;
            return next;
          });
        }

        recomputeHasMore();

        if (hasMoreRef.current) {
          preloadNextBatchRef.current();
        }
      }
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [flattenProcessForPrepend, recomputeHasMore]);

  const ensureProcessVisible = useCallback((p: ExecutionProcess) => {
    mergeIntoDisplayed((state) => {
      if (!state[p.id]) {
        state[p.id] = {
          executionProcess: {
            id: p.id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            executor_action: p.executor_action,
          },
          entries: [],
        };
      }
    });
  }, []);

  const idListKey = useMemo(
    () => executionProcessesRaw?.map((p) => p.id).join(','),
    [executionProcessesRaw]
  );

  const idStatusKey = useMemo(
    () => executionProcessesRaw?.map((p) => `${p.id}:${p.status}`).join(','),
    [executionProcessesRaw]
  );

  // Invalidate IndexedDB cache when a process transitions from running to completed/failed/killed
  const prevStatusMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const prevMap = prevStatusMapRef.current;
    for (const ep of executionProcessesRaw) {
      const prevStatus = prevMap.get(ep.id);
      if (
        prevStatus === ExecutionProcessStatus.running &&
        ep.status !== ExecutionProcessStatus.running
      ) {
        clearCachedProcessEntries(attempt.id, ep.id);
      }
    }
    // Rebuild the map for next comparison
    const nextMap = new Map<string, string>();
    for (const ep of executionProcessesRaw) {
      nextMap.set(ep.id, ep.status);
    }
    prevStatusMapRef.current = nextMap;
  }, [attempt.id, idStatusKey, executionProcessesRaw]);

  // Reset + initial load when attempt changes.
  // These MUST be in the same effect to guarantee reset runs before load,
  // preventing a race where the load effect runs first, sets
  // loadedInitialEntries=true, then the reset effect clears entries —
  // leaving the list empty with no way to recover (loadedInitialEntries
  // is already true, so the load effect's guard prevents re-running).
  useEffect(() => {
    let cancelled = false;

    // Snapshot current in-memory entries before reset. When a new EP is
    // created (e.g. follow-up after stop), idListKey changes and we
    // reload everything from the DB. But the backend log flush for a
    // just-killed process may not have completed yet, so the DB may
    // return fewer entries than we already had in memory from the live
    // WebSocket stream. Keeping the snapshot lets us fall back to the
    // richer in-memory version for those processes.
    const previousEntries = { ...displayedExecutionProcesses.current };

    // --- Reset ---
    displayedExecutionProcesses.current = {};
    loadedInitialEntries.current = false;
    streamingProcessIdsRef.current.clear();
    loadedProcessIds.current.clear();
    evictedProcessIds.current.clear();
    allHistoricProcesses.current = [];
    preloadedEntries.current.clear();
    isPreloadingRef.current = false;
    isLoadingMoreRef.current = false;
    hasReceivedRealDataRef.current = false;
    hasMoreRef.current = false;
    wantMoreRef.current = false;
    entriesLengthRef.current = 0;
    lastPrependCountRef.current = 0;
    setHasMore(false);
    setIsLoadingMore(false);
    setEntries([]);
    setScrollIntent('none');
    setInitialLoading(true);

    // --- Initial load ---
    (async () => {
      // Waiting for execution processes to load
      if (executionProcesses?.current.length === 0) return;
      if (cancelled) return;

      // Initial entries
      const allInitialEntries = await loadInitialEntries();
      if (cancelled) return;

      // For each historic process, if the DB returned fewer entries than
      // we had in memory (backend flush not yet complete), keep the
      // in-memory version so the user doesn't see entries disappear.
      for (const [epId, prev] of Object.entries(previousEntries)) {
        const loaded = allInitialEntries[epId];
        if (
          prev &&
          prev.entries.length > 0 &&
          (!loaded || loaded.entries.length < prev.entries.length)
        ) {
          allInitialEntries[epId] = prev;
        }
      }

      mergeIntoDisplayed((state) => {
        Object.assign(state, allInitialEntries);
      });
      emitState(displayedExecutionProcesses.current, 'initial');
      loadedInitialEntries.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt.id, idListKey, loadInitialEntries, emitState]);

  useEffect(() => {
    const activeProcesses = getActiveAgentProcesses();
    if (activeProcesses.length === 0) return;

    for (const activeProcess of activeProcesses) {
      if (!displayedExecutionProcesses.current[activeProcess.id]) {
        const runningOrInitial =
          Object.keys(displayedExecutionProcesses.current).length > 1
            ? 'running'
            : 'initial';
        ensureProcessVisible(activeProcess);
        emitState(displayedExecutionProcesses.current, runningOrInitial);
      }

      if (
        activeProcess.status === ExecutionProcessStatus.running &&
        !streamingProcessIdsRef.current.has(activeProcess.id)
      ) {
        streamingProcessIdsRef.current.add(activeProcess.id);
        loadRunningAndEmitWithBackoff(activeProcess).finally(() => {
          streamingProcessIdsRef.current.delete(activeProcess.id);
        });
      }
    }
  }, [
    attempt.id,
    idStatusKey,
    emitState,
    ensureProcessVisible,
    loadRunningAndEmitWithBackoff,
  ]);

  // If an execution process is removed, remove it from the state
  useEffect(() => {
    if (!executionProcessesRaw) return;

    const removedProcessIds = Object.keys(
      displayedExecutionProcesses.current
    ).filter((id) => !executionProcessesRaw.some((p) => p.id === id));

    if (removedProcessIds.length > 0) {
      mergeIntoDisplayed((state) => {
        removedProcessIds.forEach((id) => {
          delete state[id];
        });
      });
    }
  }, [attempt.id, idListKey, executionProcessesRaw]);

  // Track unmount for cancelling background retries
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setWantMore = useCallback((want: boolean) => {
    wantMoreRef.current = want;
  }, []);

  // Restore auto-scroll when user returns to the bottom of the list.
  // loadMore sets scrollIntent to 'none' to prevent scroll interference
  // during pagination; this restores it so followOutput works for new
  // streaming entries once the user scrolls back down.
  const onAtBottom = useCallback((atBottom: boolean) => {
    if (atBottom) {
      setScrollIntent('bottom-smooth');
    }
  }, []);

  return {
    entries,
    hasMore,
    isLoadingMore,
    loadMore,
    setWantMore,
    scrollIntent,
    initialLoading,
    onAtBottom,
    lastPrependCountRef,
  };
};
