import {
  CommandExitStatus,
  ExecutionProcess,
  ExecutionProcessStatus,
  NormalizedEntry,
  PatchType,
  ToolStatus,
} from 'shared/types';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { streamJsonPatchEntries } from '@/utils/streamJsonPatchEntries';
import { executionProcessesApi } from '@/lib/api';
import {
  getCachedProcessEntries,
  setCachedProcessEntries,
  isCacheStale,
} from '@/utils/conversationCache';
import type {
  AddEntryType,
  ExecutionProcessStateStore,
  OnEntriesUpdated,
  PatchTypeWithKey,
  UseConversationHistoryParams,
  UseConversationHistoryResult,
} from './types';
import {
  makeLoadingPatch,
  MIN_INITIAL_ENTRIES,
  nextActionPatch,
  REMAINING_BATCH_SIZE,
  taskDurationPatch,
} from './constants';

// Configuration for the sliding window
const PAGE_SIZE = 50;
const WINDOW_SIZE = 200; // Max entries to keep in memory
const PRELOAD_THRESHOLD = 30; // Preload when this many entries from edge
const PRELOAD_SIZE = 50; // Number of entries to preload

type PaginatedState = {
  entries: PatchTypeWithKey[];
  totalCount: number;
  loadedRanges: Array<{ start: number; end: number }>;
  isLoading: boolean;
  hasMore: boolean;
};

type ExecutionProcessPaginatedState = Record<string, PaginatedState>;

/**
 * Paginated version of useConversationHistory that:
 * 1. Loads entries from the normalized_entries table via REST API
 * 2. Uses IndexedDB for caching
 * 3. Uses a sliding window to evict distant entries when memory limit is hit
 * 4. Implements preloading when scrolling near edges
 * 5. Maintains WebSocket for running processes
 */
export const useConversationHistoryPaginated = ({
  attempt,
  onEntriesUpdated,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const { executionProcessesVisible: executionProcessesRaw } =
    useExecutionProcessesContext();
  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const streamingProcessIdsRef = useRef<Set<string>>(new Set());
  const onEntriesUpdatedRef = useRef<OnEntriesUpdated | null>(null);

  // Paginated state per execution process
  const paginatedState = useRef<ExecutionProcessPaginatedState>({});

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current;
    mutator(state);
  };

  useEffect(() => {
    onEntriesUpdatedRef.current = onEntriesUpdated;
  }, [onEntriesUpdated]);

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

  const patchWithKey = useCallback(
    (patch: PatchType, executionProcessId: string, index: number | 'user') => {
      return {
        ...patch,
        patchKey: `${executionProcessId}:${index}`,
        executionProcessId,
      };
    },
    []
  );

  const getLiveExecutionProcess = (
    executionProcessId: string
  ): ExecutionProcess | undefined => {
    return executionProcesses?.current.find(
      (executionProcess) => executionProcess.id === executionProcessId
    );
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

  /**
   * Load a page of entries from the REST API
   */
  const loadEntriesPage = useCallback(
    async (
      executionProcessId: string,
      offset: number,
      limit: number
    ): Promise<PatchTypeWithKey[]> => {
      try {
        const response = await executionProcessesApi.getEntries(
          executionProcessId,
          offset,
          limit
        );

        return response.entries.map((record) => {
          const parsedPatch: PatchType = JSON.parse(record.entry_json);
          return patchWithKey(
            parsedPatch,
            executionProcessId,
            record.entry_index
          );
        });
      } catch (error) {
        console.error(
          `Failed to load entries for ${executionProcessId}:`,
          error
        );
        return [];
      }
    },
    [patchWithKey]
  );

  /**
   * Load initial entries (most recent) for an execution process
   * Uses IndexedDB cache when available
   */
  const loadInitialEntriesPaginated = useCallback(
    async (executionProcess: ExecutionProcess): Promise<PatchTypeWithKey[]> => {
      const attemptId = attempt.id;
      const processId = executionProcess.id;

      // Check cache first
      const cached = await getCachedProcessEntries(attemptId, processId);
      if (cached && !isCacheStale(cached.cachedAt)) {
        // Use cached data immediately
        const entries = cached.entries;

        // Initialize paginated state from cache
        paginatedState.current[processId] = {
          entries,
          totalCount: cached.totalCount,
          loadedRanges: [{ start: 0, end: entries.length }],
          isLoading: false,
          hasMore: entries.length < cached.totalCount,
        };

        return entries;
      }

      // Cache miss or stale - fetch from server
      // First get the total count
      const countResponse = await executionProcessesApi.getEntries(
        processId,
        0,
        1
      );
      const totalCount = countResponse.total_count;

      if (totalCount === 0) {
        return [];
      }

      // Load the last PAGE_SIZE entries
      const startOffset = Math.max(0, totalCount - PAGE_SIZE);
      const entries = await loadEntriesPage(
        processId,
        startOffset,
        PAGE_SIZE
      );

      // Initialize paginated state
      paginatedState.current[processId] = {
        entries,
        totalCount,
        loadedRanges: [{ start: startOffset, end: totalCount }],
        isLoading: false,
        hasMore: startOffset > 0,
      };

      // Cache the entries (fire and forget)
      setCachedProcessEntries(attemptId, processId, entries, totalCount);

      return entries;
    },
    [attempt.id, loadEntriesPage]
  );

  /**
   * Merge new entries into the paginated state
   */
  const mergeEntries = (
    processId: string,
    newEntries: PatchTypeWithKey[],
    startOffset: number
  ) => {
    const state = paginatedState.current[processId];
    if (!state || newEntries.length === 0) return;

    // Merge new entries, avoiding duplicates
    const existingKeys = new Set(state.entries.map((e) => e.patchKey));
    const filteredNew = newEntries.filter((e) => !existingKeys.has(e.patchKey));

    // Insert in the correct position based on entry index
    const allEntries = [...state.entries, ...filteredNew].sort((a, b) => {
      const aIndex = parseInt(a.patchKey.split(':')[1]) || 0;
      const bIndex = parseInt(b.patchKey.split(':')[1]) || 0;
      return aIndex - bIndex;
    });

    // Update loaded ranges
    const endOffset = startOffset + newEntries.length;
    state.loadedRanges.push({ start: startOffset, end: endOffset });
    state.loadedRanges.sort((a, b) => a.start - b.start);

    // Merge overlapping ranges
    const merged: Array<{ start: number; end: number }> = [];
    for (const range of state.loadedRanges) {
      if (merged.length === 0 || merged[merged.length - 1].end < range.start) {
        merged.push({ ...range });
      } else {
        merged[merged.length - 1].end = Math.max(
          merged[merged.length - 1].end,
          range.end
        );
      }
    }
    state.loadedRanges = merged;

    // Apply sliding window eviction if we exceed the window size
    if (allEntries.length > WINDOW_SIZE) {
      // Keep the most recent entries, evict older ones
      const toKeep = allEntries.slice(-WINDOW_SIZE);
      state.entries = toKeep;
      // Update hasMore based on whether we evicted entries from the start
      state.hasMore = true;
    } else {
      state.entries = allEntries;
    }
  };

  /**
   * Preload entries ahead of the current scroll position
   * Call this when the user scrolls near the edge of loaded content
   */
  const preloadEntries = async (
    executionProcessId: string,
    direction: 'before' | 'after'
  ): Promise<PatchTypeWithKey[]> => {
    const state = paginatedState.current[executionProcessId];
    if (!state || state.isLoading) return [];

    state.isLoading = true;

    try {
      let offset: number;
      if (direction === 'before') {
        // Preload earlier entries
        const firstRange = state.loadedRanges[0];
        if (!firstRange || firstRange.start === 0) {
          state.hasMore = false;
          return [];
        }
        offset = Math.max(0, firstRange.start - PRELOAD_SIZE);
      } else {
        // Preload later entries (shouldn't happen if we load from the end)
        const lastRange = state.loadedRanges[state.loadedRanges.length - 1];
        if (!lastRange || lastRange.end >= state.totalCount) {
          return [];
        }
        offset = lastRange.end;
      }

      const newEntries = await loadEntriesPage(
        executionProcessId,
        offset,
        PRELOAD_SIZE
      );
      mergeEntries(executionProcessId, newEntries, offset);
      return newEntries;
    } finally {
      state.isLoading = false;
    }
  };

  /**
   * Check if preloading is needed based on visible range
   */
  const checkPreload = async (
    executionProcessId: string,
    firstVisibleIndex: number,
    lastVisibleIndex: number
  ) => {
    const state = paginatedState.current[executionProcessId];
    if (!state) return;

    const firstLoaded = state.loadedRanges[0]?.start ?? 0;
    const lastLoaded =
      state.loadedRanges[state.loadedRanges.length - 1]?.end ?? 0;

    // Check if we're near the start edge
    if (firstVisibleIndex - firstLoaded < PRELOAD_THRESHOLD && firstLoaded > 0) {
      await preloadEntries(executionProcessId, 'before');
    }

    // Check if we're near the end edge (rare case)
    if (
      lastLoaded - lastVisibleIndex < PRELOAD_THRESHOLD &&
      lastLoaded < state.totalCount
    ) {
      await preloadEntries(executionProcessId, 'after');
    }
  };

  const loadEntriesForHistoricExecutionProcess = useCallback(
    async (executionProcess: ExecutionProcess): Promise<PatchTypeWithKey[]> => {
      // Use paginated loading for normal execution processes
      if (
        executionProcess.executor_action.typ.type ===
          'CodingAgentInitialRequest' ||
        executionProcess.executor_action.typ.type ===
          'CodingAgentFollowUpRequest' ||
        executionProcess.executor_action.typ.type === 'ReviewRequest'
      ) {
        return loadInitialEntriesPaginated(executionProcess);
      }

      // Fallback to streaming for script requests
      let url = '';
      if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
        url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
      } else {
        url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
      }

      return new Promise<PatchTypeWithKey[]>((resolve) => {
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onFinished: (allEntries) => {
            controller.close();
            resolve(
              allEntries.map((entry, idx) =>
                patchWithKey(entry, executionProcess.id, idx)
              )
            );
          },
          onError: (err) => {
            console.warn(
              `Error loading entries for historic execution process ${executionProcess.id}`,
              err
            );
            controller.close();
            resolve([]);
          },
        });
      });
    },
    [loadInitialEntriesPaginated, patchWithKey]
  );

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

  const flattenEntriesForEmit = useCallback(
    (executionProcessState: ExecutionProcessStateStore): PatchTypeWithKey[] => {
      // Flags to control Next Action bar emit
      let hasPendingApproval = false;
      let hasRunningProcess = false;
      let lastProcessFailedOrKilled = false;
      let needsSetup = false;
      let setupHelpText: string | undefined;

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

            const filteredEntries = p.entries.filter(
              (e) =>
                e.type !== 'NORMALIZED_ENTRY' ||
                (e.content.entry_type.type !== 'user_message' &&
                  e.content.entry_type.type !== 'token_usage_info')
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

      return allEntries;
    },
    [patchWithKey]
  );

  const emitEntries = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      loading: boolean
    ) => {
      const entries = flattenEntriesForEmit(executionProcessState);
      let modifiedAddEntryType = addEntryType;

      // Modify so that if add entry type is 'running' and last entry is a plan, emit special plan type
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        if (
          lastEntry.type === 'NORMALIZED_ENTRY' &&
          lastEntry.content.entry_type.type === 'tool_use' &&
          lastEntry.content.entry_type.tool_name === 'ExitPlanMode'
        ) {
          modifiedAddEntryType = 'plan';
        }
      }

      onEntriesUpdatedRef.current?.(entries, modifiedAddEntryType, loading);
    },
    [flattenEntriesForEmit]
  );

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
            emitEntries(displayedExecutionProcesses.current, 'running', false);
          },
          onFinished: () => {
            emitEntries(displayedExecutionProcesses.current, 'running', false);
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
    [emitEntries, patchWithKey]
  );

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  const loadRunningAndEmitWithBackoff = useCallback(
    async (executionProcess: ExecutionProcess) => {
      for (let i = 0; i < 20; i++) {
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

  const loadInitialEntries =
    useCallback(async (): Promise<ExecutionProcessStateStore> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};

      if (!executionProcesses?.current) return localDisplayedExecutionProcesses;

      for (const executionProcess of [
        ...executionProcesses.current,
      ].reverse()) {
        if (executionProcess.status === ExecutionProcessStatus.running)
          continue;

        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess);

        localDisplayedExecutionProcesses[executionProcess.id] = {
          executionProcess,
          entries,
        };

        if (
          flattenEntries(localDisplayedExecutionProcesses).length >
          MIN_INITIAL_ENTRIES
        ) {
          break;
        }
      }

      return localDisplayedExecutionProcesses;
    }, [executionProcesses, loadEntriesForHistoricExecutionProcess]);

  const loadRemainingEntriesInBatches = useCallback(
    async (batchSize: number): Promise<boolean> => {
      if (!executionProcesses?.current) return false;

      let anyUpdated = false;
      for (const executionProcess of [
        ...executionProcesses.current,
      ].reverse()) {
        const current = displayedExecutionProcesses.current;
        if (
          current[executionProcess.id] ||
          executionProcess.status === ExecutionProcessStatus.running
        )
          continue;

        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess);

        mergeIntoDisplayed((state) => {
          state[executionProcess.id] = {
            executionProcess,
            entries,
          };
        });

        if (
          flattenEntries(displayedExecutionProcesses.current).length > batchSize
        ) {
          anyUpdated = true;
          break;
        }
        anyUpdated = true;
      }
      return anyUpdated;
    },
    [executionProcesses, loadEntriesForHistoricExecutionProcess]
  );

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
      emitEntries(displayedExecutionProcesses.current, 'initial', false);
      loadedInitialEntries.current = true;

      // Then load the remaining in batches
      while (
        !cancelled &&
        (await loadRemainingEntriesInBatches(REMAINING_BATCH_SIZE))
      ) {
        if (cancelled) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      emitEntries(displayedExecutionProcesses.current, 'historic', false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attempt.id,
    idListKey,
    loadInitialEntries,
    loadRemainingEntriesInBatches,
    emitEntries,
  ]);

  // Handle running processes
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
        emitEntries(
          displayedExecutionProcesses.current,
          runningOrInitial,
          false
        );
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
    emitEntries,
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
    paginatedState.current = {};
    emitEntries(displayedExecutionProcesses.current, 'initial', true);
  }, [attempt.id, emitEntries]);

  // Expose methods for external use
  return {
    // Preload method for scroll-aware loading
    preloadBefore: (executionProcessId: string) =>
      preloadEntries(executionProcessId, 'before'),
    preloadAfter: (executionProcessId: string) =>
      preloadEntries(executionProcessId, 'after'),

    // Get current loaded state
    getPaginatedState: (executionProcessId: string) =>
      paginatedState.current[executionProcessId],

    // Check if preloading is needed
    checkPreload,
  } as UseConversationHistoryResult;
};
