import { useCallback, useRef, useState } from 'react';
import { useConversationHistoryOld } from './useConversationHistoryOld';
import { useApi } from '@/hooks/useApi';
import type {
  PatchTypeWithKey,
  ScrollState,
  UseConversationHistoryParams,
  UseConversationWindowResult,
  WindowMode,
} from './types';
import type { NormalizedEntry, PatchType } from 'shared/types';
import type { SessionConversationEntryRecord } from '@/lib/api';

function parseEntryJson(
  entryJson: string,
  executionProcessId: string,
  entryIndex: number
): PatchTypeWithKey | null {
  try {
    const content = JSON.parse(entryJson);
    const patch: PatchType = { type: 'NORMALIZED_ENTRY', content };
    return {
      ...patch,
      patchKey: `${executionProcessId}:${entryIndex}`,
      executionProcessId,
    };
  } catch {
    return null;
  }
}

function makeSyntheticUserMessage(
  processId: string,
  prompt: string
): PatchTypeWithKey {
  const userEntry: NormalizedEntry = {
    entry_type: { type: 'user_message' },
    content: prompt,
    timestamp: null,
  };
  const patch: PatchType = { type: 'NORMALIZED_ENTRY', content: userEntry };
  return {
    ...patch,
    patchKey: `${processId}:user`,
    executionProcessId: processId,
  };
}

/**
 * Parse a batch of raw session entries into PatchTypeWithKey[], filtering
 * DB user_message entries and injecting a synthetic user message at each
 * process boundary (when the batch contains entry_index==0 for that process).
 *
 * Mutates `renderedProcesses` to record which processes have already had a
 * synthetic user message injected, so subsequent batches don't double-inject.
 */
function parseWithUserMessages(
  rawEntries: SessionConversationEntryRecord[],
  summaries: Map<string, string>,
  renderedProcesses: Set<string>
): PatchTypeWithKey[] {
  const out: PatchTypeWithKey[] = [];
  for (const r of rawEntries) {
    const processId = r.execution_process_id;
    const parsed = parseEntryJson(r.entry_json, processId, r.entry_index);
    if (!parsed) continue;
    // Keep real user_message entries from DB (follow-ups in continuous mode)
    if (r.entry_index === 0 && !renderedProcesses.has(processId)) {
      const summary = summaries.get(processId);
      if (summary !== undefined) {
        out.push(makeSyntheticUserMessage(processId, summary));
      }
      renderedProcesses.add(processId);
    }
    out.push(parsed);
  }
  return out;
}

export const useConversationWindow = (
  params: UseConversationHistoryParams
): UseConversationWindowResult => {
  const { sessionsApi } = useApi();
  const tailHook = useConversationHistoryOld(params);

  const [windowMode, setWindowMode] = useState<WindowMode>({ mode: 'tail' });
  const [scrollState, setScrollState] = useState<ScrollState>('tail-following');
  const [anchoredEntries, setAnchoredEntries] = useState<PatchTypeWithKey[]>(
    []
  );
  const [isJumping, setIsJumping] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingBefore, setIsLoadingBefore] = useState(false);
  const [isLoadingAfter, setIsLoadingAfter] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const sessionId = params.attempt.session?.id;

  // Window endpoints and has-more flags — kept in refs so async callbacks
  // see the freshest values without re-creating on every entry update.
  const firstCursorRef = useRef<string | null>(null);
  const lastCursorRef = useRef<string | null>(null);
  const hasMoreBeforeRef = useRef(false);
  const hasMoreAfterRef = useRef(false);
  const isLoadingBeforeRef = useRef(false);
  const isLoadingAfterRef = useRef(false);

  // For prepend scroll compensation — VirtualizedList reads this.
  const lastPrependCountRef = useRef(0);

  // Maps processId -> summary (from TOC response), used for synthetic user messages.
  const summariesMapRef = useRef<Map<string, string>>(new Map());
  // Tracks which process IDs already have a synthetic user message in anchoredEntries.
  const renderedProcessesRef = useRef<Set<string>>(new Set());

  // Count unread entries (from live tail) when not in tail-following mode.
  const prevTailEntriesLenRef = useRef(tailHook.entries.length);
  if (scrollState !== 'tail-following') {
    const newLen = tailHook.entries.length;
    if (newLen > prevTailEntriesLenRef.current) {
      const newEntries = tailHook.entries.slice(prevTailEntriesLenRef.current);
      const relevantCount = newEntries.filter(
        (e) =>
          e.type === 'NORMALIZED_ENTRY' &&
          (e.content.entry_type.type === 'assistant_message' ||
            e.content.entry_type.type === 'user_message')
      ).length;
      if (relevantCount > 0) {
        setUnreadCount((prev) => prev + relevantCount);
      }
    }
  }
  prevTailEntriesLenRef.current = tailHook.entries.length;

  const jumpTo = useCallback(
    async (
      anchorCursor: string,
      processId: string,
      allSummaries: Array<{
        execution_process_id: string;
        summary: string;
      }>
    ) => {
      if (!sessionId) return;
      setIsJumping(true);
      try {
        summariesMapRef.current = new Map(
          allSummaries.map((s) => [s.execution_process_id, s.summary])
        );
        renderedProcessesRef.current = new Set();

        const result = await sessionsApi.getSessionEntries(sessionId, {
          after: anchorCursor,
          limit: 200,
        });

        const parsed = parseWithUserMessages(
          result.entries,
          summariesMapRef.current,
          renderedProcessesRef.current
        );

        setAnchoredEntries(parsed);
        firstCursorRef.current = result.first_cursor;
        lastCursorRef.current = result.last_cursor;
        hasMoreBeforeRef.current = result.has_more_before;
        hasMoreAfterRef.current = result.has_more_after;

        setWindowMode({ mode: 'anchored', anchorProcessId: processId });
        setScrollState('anchored');
        lastPrependCountRef.current = 0;
      } finally {
        setIsJumping(false);
      }
    },
    [sessionId, sessionsApi]
  );

  const loadAfter = useCallback(async () => {
    if (!sessionId) return;
    if (isLoadingAfterRef.current) return;
    if (!hasMoreAfterRef.current) return;
    if (!lastCursorRef.current) return;

    isLoadingAfterRef.current = true;
    setIsLoadingMore(true);
    setIsLoadingAfter(true);
    try {
      const result = await sessionsApi.getSessionEntries(sessionId, {
        after: lastCursorRef.current,
        limit: 200,
      });

      const parsed = parseWithUserMessages(
        result.entries,
        summariesMapRef.current,
        renderedProcessesRef.current
      );

      if (parsed.length > 0) {
        setAnchoredEntries((prev) => {
          const existingKeys = new Set(prev.map((e) => e.patchKey));
          const unique = parsed.filter((e) => !existingKeys.has(e.patchKey));
          return unique.length > 0 ? [...prev, ...unique] : prev;
        });
      }

      if (result.last_cursor) {
        lastCursorRef.current = result.last_cursor;
      }
      hasMoreAfterRef.current = result.has_more_after;
    } finally {
      isLoadingAfterRef.current = false;
      setIsLoadingAfter(false);
      setIsLoadingMore(false);
    }
  }, [sessionId, sessionsApi]);

  const loadBefore = useCallback(async () => {
    if (!sessionId) return;
    if (isLoadingBeforeRef.current) return;
    if (!hasMoreBeforeRef.current) return;
    if (!firstCursorRef.current) return;

    isLoadingBeforeRef.current = true;
    setIsLoadingMore(true);
    setIsLoadingBefore(true);
    try {
      const result = await sessionsApi.getSessionEntries(sessionId, {
        before: firstCursorRef.current,
        limit: 200,
      });

      const parsed = parseWithUserMessages(
        result.entries,
        summariesMapRef.current,
        renderedProcessesRef.current
      );

      if (parsed.length > 0) {
        lastPrependCountRef.current = parsed.length;
        setAnchoredEntries((prev) => {
          const existingKeys = new Set(prev.map((e) => e.patchKey));
          const unique = parsed.filter((e) => !existingKeys.has(e.patchKey));
          return unique.length > 0 ? [...unique, ...prev] : prev;
        });
      }

      if (result.first_cursor) {
        firstCursorRef.current = result.first_cursor;
      }
      hasMoreBeforeRef.current = result.has_more_before;
    } finally {
      isLoadingBeforeRef.current = false;
      setIsLoadingBefore(false);
      setIsLoadingMore(false);
    }
  }, [sessionId, sessionsApi]);

  const returnToBottom = useCallback(() => {
    setWindowMode({ mode: 'tail' });
    setScrollState('tail-following');
    setAnchoredEntries([]);
    setUnreadCount(0);
    setIsLoadingMore(false);
    setIsLoadingBefore(false);
    setIsLoadingAfter(false);
    isLoadingBeforeRef.current = false;
    isLoadingAfterRef.current = false;
    firstCursorRef.current = null;
    lastCursorRef.current = null;
    hasMoreBeforeRef.current = false;
    hasMoreAfterRef.current = false;
    summariesMapRef.current = new Map();
    renderedProcessesRef.current = new Set();
    lastPrependCountRef.current = 0;
  }, []);

  const wrappedOnAtBottom = useCallback(
    (atBottom: boolean) => {
      if (windowMode.mode === 'tail') {
        if (atBottom) {
          setScrollState('tail-following');
          setUnreadCount(0);
        } else {
          setScrollState('tail-browsing');
        }
        tailHook.onAtBottom(atBottom);
      }
    },
    [windowMode.mode, tailHook]
  );

  const extras = {
    windowMode,
    scrollState,
    jumpTo,
    returnToBottom,
    loadAfter,
    unreadCount,
    isJumping,
    isLoadingBefore,
    isLoadingAfter,
  };

  if (windowMode.mode === 'tail') {
    return {
      ...tailHook,
      onAtBottom: wrappedOnAtBottom,
      ...extras,
      isLoadingBefore: tailHook.isLoadingMore,
      isLoadingAfter: false,
    };
  }

  return {
    entries: anchoredEntries,
    hasMore: hasMoreBeforeRef.current,
    isLoadingMore,
    loadMore: loadBefore,
    setWantMore: tailHook.setWantMore,
    scrollIntent: 'none',
    initialLoading: false,
    onAtBottom: wrappedOnAtBottom,
    lastPrependCountRef,
    ...extras,
  };
};
