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

const FIRST_ITEM_INDEX_BASE = 100_000;

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
  const [firstItemIndex, setFirstItemIndex] = useState(FIRST_ITEM_INDEX_BASE);
  const [scrollIntent, setScrollIntent] = useState<ScrollIntent>('none');
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // --- Refs for stable loadMore (read inside callback, avoid closure staleness) ---
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const prevFirstKeyRef = useRef<string | null>(null);
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

  // Refs for stable loadMore — stores latest function versions so the
  // empty-deps useCallback always calls the current implementation.
  const emitStateRef = useRef<
    (state: ExecutionProcessStateStore, addType: AddEntryType) => void
  >(() => {});
  const preloadNextBatchRef = useRef<() => Promise<void>>(async () => {});
  const loadEntriesRef = useRef<
    (ep: ExecutionProcess) => Promise<PatchTypeWithKey[]>
  >(async () => []);
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
    async (executionProcess: ExecutionProcess): Promise<PatchTypeWithKey[]> => {
      const attemptId = attempt.id;
      const processId = executionProcess.id;

      // Try IndexedDB cache first
      const cached = await getCachedProcessEntries(attemptId, processId);
      if (cached && !isCacheStale(cached.cachedAt)) {
        return cached.entries;
      }

      // Cache miss or stale — fetch via WebSocket
      let url = '';
      if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
        url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
      } else {
        url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
      }

      const rawEntries = await new Promise<PatchType[]>((resolve) => {
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onFinished: (allEntries) => {
            controller.close();
            resolve(allEntries);
          },
          onError: (err) => {
            console.warn(
              `Error loading entries for historic execution process ${processId}`,
              err
            );
            controller.close();
            resolve([]);
          },
        });
      });

      const entriesWithKey = rawEntries.map((e, idx) =>
        patchWithKey(e, processId, idx)
      );

      // Write to IndexedDB cache (fire-and-forget), only for completed processes
      if (
        entriesWithKey.length > 0 &&
        executionProcess.status !== ExecutionProcessStatus.running
      ) {
        setCachedProcessEntries(
          attemptId,
          processId,
          entriesWithKey,
          entriesWithKey.length
        );
      }

      return entriesWithKey;
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
      addEntryType: AddEntryType
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
        const sorted = Object.entries(executionProcessState).sort(
          addEntryType === 'historic' ? (a, b) => ascending(b, a) : ascending
        );
        let remaining = totalEntries;
        for (const [id, proc] of sorted) {
          if (remaining <= MAX_IN_MEMORY_ENTRIES) break;
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
      const newHasMore = stillRemaining.length > 0 || hasEvicted;
      setHasMore(newHasMore);
      hasMoreRef.current = newHasMore;

      // --- Compute firstItemIndex for historic prepends ---
      // Use key-based lookup to find exactly how many items were prepended,
      // which is immune to entry count changes from concurrent streaming.
      if (addEntryType === 'historic') {
        const prevKey = prevFirstKeyRef.current;
        let prepended = 0;
        if (prevKey && newEntries.length > 0) {
          const idx = newEntries.findIndex((e) => e.patchKey === prevKey);
          if (idx > 0) prepended = idx;
        }
        if (prepended > 0) {
          setFirstItemIndex((prev) => prev - prepended);
        }
      }
      prevFirstKeyRef.current = newEntries[0]?.patchKey ?? null;

      // --- Compute scrollIntent ---
      if (effectiveAddType === 'running' || effectiveAddType === 'plan') {
        setScrollIntent('bottom-smooth');
      } else if (effectiveAddType === 'initial') {
        setScrollIntent('bottom-instant');
      } else {
        // 'historic' — no scroll change, Virtuoso handles via firstItemIndex
        setScrollIntent('none');
      }

      // --- Set entries (single source of truth) ---
      setEntries(newEntries);

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
    (executionProcess: ExecutionProcess): Promise<void> => {
      return new Promise((resolve, reject) => {
        let url = '';
        if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
          url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
        } else {
          url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
        }
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
      const entriesWithKey =
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
        const entriesWithKey =
          await loadEntriesForHistoricExecutionProcess(executionProcess);

        localDisplayedExecutionProcesses[executionProcess.id] = {
          executionProcess,
          entries: entriesWithKey,
        };
        loadedProcessIds.current.add(executionProcess.id);

        if (
          flattenEntries(localDisplayedExecutionProcesses).length >
          MIN_INITIAL_ENTRIES
        ) {
          break;
        }
      }

      // Check if there are more processes to load
      const remainingProcesses = historicProcesses.filter(
        (p) => !loadedProcessIds.current.has(p.id)
      );
      setHasMore(remainingProcesses.length > 0);
      hasMoreRef.current = remainingProcesses.length > 0;

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

  // Load more historic entries — STABLE reference (empty deps).
  // Reads hasMoreRef/isLoadingMoreRef and function refs to avoid closure staleness.
  // Loops internally while wantMoreRef is true and hasMoreRef is true,
  // so continuous pagination doesn't depend on external effect timing.
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      // Yield to let React render the loading state before we proceed.
      await new Promise((r) => setTimeout(r, 0));

      // Loop: keep loading while consumer wants more and there is more
      let prevDisplayedCount = Object.keys(
        displayedExecutionProcesses.current
      ).length;
      do {
        // First, use any preloaded entries
        const preloaded = Array.from(preloadedEntries.current.values());
        if (preloaded.length > 0) {
          for (const state of preloaded) {
            mergeIntoDisplayed((s) => {
              s[state.executionProcess.id] = state;
            });
            loadedProcessIds.current.add(state.executionProcess.id);
            evictedProcessIds.current.delete(state.executionProcess.id);
          }
          preloadedEntries.current.clear();

          emitStateRef.current(displayedExecutionProcesses.current, 'historic');

          if (hasMoreRef.current) {
            preloadNextBatchRef.current();
          }
        } else {
          // No preloaded content, load synchronously
          // First try never-loaded processes, then evicted ones
          let remainingProcesses = allHistoricProcesses.current.filter(
            (p) => !loadedProcessIds.current.has(p.id)
          );

          // If all never-loaded processes are done, try re-loading evicted ones
          if (
            remainingProcesses.length === 0 &&
            evictedProcessIds.current.size > 0
          ) {
            remainingProcesses = allHistoricProcesses.current.filter(
              (p) =>
                evictedProcessIds.current.has(p.id) &&
                !displayedExecutionProcesses.current[p.id]
            );
          }

          if (remainingProcesses.length === 0) {
            setHasMore(false);
            hasMoreRef.current = false;
            break;
          }

          let entriesLoaded = 0;
          for (const executionProcess of remainingProcesses) {
            const entriesWithKey =
              await loadEntriesRef.current(executionProcess);

            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: entriesWithKey,
              };
            });
            loadedProcessIds.current.add(executionProcess.id);
            // Remove from evicted set since it's back in memory
            evictedProcessIds.current.delete(executionProcess.id);
            entriesLoaded += entriesWithKey.length;

            if (entriesLoaded >= MIN_INITIAL_ENTRIES) {
              break;
            }
          }

          emitStateRef.current(displayedExecutionProcesses.current, 'historic');

          if (hasMoreRef.current) {
            preloadNextBatchRef.current();
          }
        }

        // Yield between iterations so React can render the new entries
        // and Virtuoso can update scroll position.
        await new Promise((r) => setTimeout(r, 0));

        // Progress guard: if the displayed set didn't grow, we're in an
        // eviction cycle (loading A evicts B, loading B evicts A). Break
        // to avoid an infinite loop.
        const currentDisplayedCount = Object.keys(
          displayedExecutionProcesses.current
        ).length;
        if (currentDisplayedCount <= prevDisplayedCount) {
          break;
        }
        prevDisplayedCount = currentDisplayedCount;
      } while (wantMoreRef.current && hasMoreRef.current);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

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

  // Initial load when attempt changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Waiting for execution processes to load
      if (
        executionProcesses?.current.length === 0 ||
        loadedInitialEntries.current
      )
        return;

      // Initial entries
      const allInitialEntries = await loadInitialEntries();
      if (cancelled) return;
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

  // Reset state when attempt changes
  useEffect(() => {
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
    prevFirstKeyRef.current = null;
    hasMoreRef.current = false;
    wantMoreRef.current = false;
    setHasMore(false);
    setIsLoadingMore(false);
    setEntries([]);
    setFirstItemIndex(FIRST_ITEM_INDEX_BASE);
    setScrollIntent('none');
    setInitialLoading(true);
  }, [attempt.id]);

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

  return {
    entries,
    firstItemIndex,
    hasMore,
    isLoadingMore,
    loadMore,
    setWantMore,
    scrollIntent,
    initialLoading,
  };
};
