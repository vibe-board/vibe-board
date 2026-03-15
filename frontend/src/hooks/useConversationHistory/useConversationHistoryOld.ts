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
  taskDurationPatch,
} from './constants';

export const useConversationHistoryOld = ({
  attempt,
  onEntriesUpdated,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const { executionProcessesVisible: executionProcessesRaw } =
    useExecutionProcessesContext();
  const { setTokenUsageInfo } = useEntries();
  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const streamingProcessIdsRef = useRef<Set<string>>(new Set());
  const onEntriesUpdatedRef = useRef<OnEntriesUpdated | null>(null);
  // Track pagination state
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadedProcessIds = useRef<Set<string>>(new Set());
  const allHistoricProcesses = useRef<ExecutionProcess[]>([]);
  // Preloaded entries cache: processId -> { executionProcess, entries }
  const preloadedEntries = useRef<Map<string, ExecutionProcessStateStore[string]>>(new Map());
  const [isPreloading, setIsPreloading] = useState(false);

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

  const loadEntriesForHistoricExecutionProcess = (
    executionProcess: ExecutionProcess
  ) => {
    let url = '';
    if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
      url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
    } else {
      url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
    }

    return new Promise<PatchType[]>((resolve) => {
      const controller = streamJsonPatchEntries<PatchType>(url, {
        onFinished: (allEntries) => {
          controller.close();
          resolve(allEntries);
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
  };

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
            const liveProcess = getLiveExecutionProcess(
              p.executionProcess.id
            );
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
    [emitEntries]
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

  // Get all historic (non-running) processes in reverse chronological order
  const getHistoricProcesses = useCallback((): ExecutionProcess[] => {
    if (!executionProcesses?.current) return [];
    return [...executionProcesses.current]
      .filter((ep) => ep.status !== ExecutionProcessStatus.running)
      .reverse();
  }, [executionProcesses]);

  // Preload next batch into cache (non-blocking)
  const preloadNextBatch = useCallback(async () => {
    if (isPreloading) return;

    const remainingProcesses = allHistoricProcesses.current.filter(
      (p) => !loadedProcessIds.current.has(p.id) && !preloadedEntries.current.has(p.id)
    );

    if (remainingProcesses.length === 0) return;

    setIsPreloading(true);

    // Preload up to MIN_INITIAL_ENTRIES worth of content
    let entriesLoaded = 0;
    for (const executionProcess of remainingProcesses) {
      const entries =
        await loadEntriesForHistoricExecutionProcess(executionProcess);
      const entriesWithKey = entries.map((e, idx) =>
        patchWithKey(e, executionProcess.id, idx)
      );

      preloadedEntries.current.set(executionProcess.id, {
        executionProcess,
        entries: entriesWithKey,
      });
      entriesLoaded += entries.length;

      if (entriesLoaded >= MIN_INITIAL_ENTRIES) {
        break;
      }
    }

    setIsPreloading(false);
  }, [isPreloading]);

  const loadInitialEntries =
    useCallback(async (): Promise<ExecutionProcessStateStore> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};

      const historicProcesses = getHistoricProcesses();
      // Store all historic processes for later pagination
      allHistoricProcesses.current = historicProcesses;
      // Clear preloaded cache
      preloadedEntries.current.clear();

      for (const executionProcess of historicProcesses) {
        const entries =
          await loadEntriesForHistoricExecutionProcess(executionProcess);
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, executionProcess.id, idx)
        );

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

      // Start preloading next batch in background
      if (remainingProcesses.length > 0) {
        preloadNextBatch();
      }

      return localDisplayedExecutionProcesses;
    }, [getHistoricProcesses, preloadNextBatch]);

  // Load more historic entries - use preloaded cache if available
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    // Yield to let React render the loading state before we proceed.
    // Without this, React 18 batches the setIsLoadingMore(true) and
    // setIsLoadingMore(false) calls synchronously, so the loading
    // spinner never appears in the preloaded path.
    await new Promise((r) => setTimeout(r, 0));

    // First, use any preloaded entries
    const preloaded = Array.from(preloadedEntries.current.values());
    if (preloaded.length > 0) {
      for (const state of preloaded) {
        mergeIntoDisplayed((s) => {
          s[state.executionProcess.id] = state;
        });
        loadedProcessIds.current.add(state.executionProcess.id);
      }
      preloadedEntries.current.clear();

      // Emit with loading=true while we start the next preload
      emitEntries(displayedExecutionProcesses.current, 'historic', true);

      // Check if there are still more
      const stillRemaining = allHistoricProcesses.current.filter(
        (p) => !loadedProcessIds.current.has(p.id)
      );
      setHasMore(stillRemaining.length > 0);

      // Start preloading next batch in background BEFORE clearing loading state
      if (stillRemaining.length > 0) {
        preloadNextBatch();
      }

      setIsLoadingMore(false);
      emitEntries(displayedExecutionProcesses.current, 'historic', false);
      return;
    }

    // No preloaded content, load synchronously
    const remainingProcesses = allHistoricProcesses.current.filter(
      (p) => !loadedProcessIds.current.has(p.id)
    );

    if (remainingProcesses.length === 0) {
      setHasMore(false);
      setIsLoadingMore(false);
      return;
    }

    let entriesLoaded = 0;
    for (const executionProcess of remainingProcesses) {
      const entries =
        await loadEntriesForHistoricExecutionProcess(executionProcess);
      const entriesWithKey = entries.map((e, idx) =>
        patchWithKey(e, executionProcess.id, idx)
      );

      mergeIntoDisplayed((state) => {
        state[executionProcess.id] = {
          executionProcess,
          entries: entriesWithKey,
        };
      });
      loadedProcessIds.current.add(executionProcess.id);
      entriesLoaded += entries.length;

      emitEntries(displayedExecutionProcesses.current, 'historic', true);

      if (entriesLoaded >= MIN_INITIAL_ENTRIES) {
        break;
      }
    }

    const stillRemaining = allHistoricProcesses.current.filter(
      (p) => !loadedProcessIds.current.has(p.id)
    );
    setHasMore(stillRemaining.length > 0);
    setIsLoadingMore(false);
    emitEntries(displayedExecutionProcesses.current, 'historic', false);

    // Start preloading next batch
    if (stillRemaining.length > 0) {
      preloadNextBatch();
    }
  }, [isLoadingMore, hasMore, emitEntries, preloadNextBatch]);

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
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attempt.id,
    idListKey,
    loadInitialEntries,
    emitEntries,
  ]); // include idListKey so new processes trigger reload

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
    loadedProcessIds.current.clear();
    allHistoricProcesses.current = [];
    setHasMore(false);
    setIsLoadingMore(false);
    emitEntries(displayedExecutionProcesses.current, 'initial', true);
  }, [attempt.id, emitEntries]);

  return {
    loadMore,
    hasMore,
    isLoadingMore,
  };
};
