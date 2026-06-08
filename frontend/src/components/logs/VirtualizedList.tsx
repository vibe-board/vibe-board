import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import { useConversationWindow } from '@/hooks/useConversationHistory';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Task } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: Task;
  activeAgentId?: string | null;
  onJumpToReady?: (
    fn: (
      anchorCursor: string,
      processId: string,
      allSummaries: Array<{
        execution_process_id: string;
        summary: string;
        full_prompt: string;
      }>
    ) => Promise<void>
  ) => void;
  onVisibleProcessIdChange?: (id: string | null) => void;
}

const AT_BOTTOM_THRESHOLD = 50;
const AT_TOP_THRESHOLD = 100;

const VirtualizedList = ({
  attempt,
  task,
  activeAgentId,
  onJumpToReady,
  onVisibleProcessIdChange,
}: VirtualizedListProps) => {
  const {
    entries,
    loadMore,
    setWantMore,
    scrollIntent,
    initialLoading,
    isLoadingBefore,
    isLoadingAfter,
    onAtBottom,
    lastPrependCountRef,
    windowMode,
    scrollState,
    loadAfter,
    returnToBottom,
    unreadCount,
    isJumping,
    jumpTo,
  } = useConversationWindow({ attempt });

  const { setEntries, reset } = useEntries();

  const filteredEntries = useMemo(() => {
    if (activeAgentId === undefined || activeAgentId === null) {
      return entries.filter(
        (e) =>
          !(e.type === 'NORMALIZED_ENTRY' && e.content.agent_id) ||
          (e.type === 'NORMALIZED_ENTRY' &&
            e.content.entry_type.type === 'subagent_started')
      );
    }
    return entries.filter(
      (e) =>
        e.type === 'NORMALIZED_ENTRY' && e.content.agent_id === activeAgentId
    );
  }, [entries, activeAgentId]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevTotalSizeRef = useRef(0);
  const isAtBottomRef = useRef(true);

  // Callback refs — the scroll listener is mounted once and reads
  // current callbacks via ref, so re-renders of useConversationWindow
  // (very frequent in tail mode due to WS streaming) don't detach/re-attach
  // the listener and lose scroll events.
  const loadMoreRef = useRef(loadMore);
  const setWantMoreRef = useRef(setWantMore);
  const onAtBottomRef = useRef(onAtBottom);
  const loadAfterRef = useRef(loadAfter);
  const windowModeRef = useRef(windowMode.mode);
  loadMoreRef.current = loadMore;
  setWantMoreRef.current = setWantMore;
  onAtBottomRef.current = onAtBottom;
  loadAfterRef.current = loadAfter;
  windowModeRef.current = windowMode.mode;

  // Expose jumpTo to parent via callback
  useEffect(() => {
    onJumpToReady?.(jumpTo);
  }, [jumpTo, onJumpToReady]);

  // Reset EntriesContext when attempt changes
  useEffect(() => {
    reset();
  }, [attempt.id, reset]);

  // Sync entries to EntriesContext
  useEffect(() => {
    setEntries(entries);
  }, [entries, setEntries]);

  const virtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (i) => filteredEntries[i]?.patchKey ?? `idx-${i}`,
  });

  // --- Prepend scroll compensation ---
  useLayoutEffect(() => {
    const count = lastPrependCountRef.current;
    if (count <= 0) return;
    lastPrependCountRef.current = 0;

    const container = scrollContainerRef.current;
    if (!container) return;

    const newTotalSize = virtualizer.getTotalSize();
    const delta = newTotalSize - prevTotalSizeRef.current;
    if (delta > 0) {
      container.scrollTop += delta;
    }
  }, [filteredEntries, virtualizer, lastPrependCountRef]);

  // --- Anchor-jump scroll reset ---
  // When jumpTo switches us into anchored mode, or switches the anchor to a
  // different process, scroll the container to the top so the target
  // process's synthetic user message is the first thing the user sees.
  // Without this, scrollTop carries over from the previous window (often
  // the bottom of tail mode) and gets clamped into the wrong position.
  const prevAnchorProcessIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const currentAnchor =
      windowMode.mode === 'anchored' ? windowMode.anchorProcessId : null;
    if (currentAnchor && currentAnchor !== prevAnchorProcessIdRef.current) {
      const container = scrollContainerRef.current;
      if (container) container.scrollTop = 0;
    }
    prevAnchorProcessIdRef.current = currentAnchor;
  }, [windowMode, filteredEntries.length]);

  // Track totalSize for next prepend compensation
  useEffect(() => {
    prevTotalSizeRef.current = virtualizer.getTotalSize();
  });

  // --- Scroll event: at-top / at-bottom detection ---
  // Mount the listener exactly once. Callbacks are read via refs above
  // so we don't tear down the listener on every render.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const atBottom = distanceFromBottom <= AT_BOTTOM_THRESHOLD;
        const atTop = scrollTop <= AT_TOP_THRESHOLD;

        isAtBottomRef.current = atBottom;
        onAtBottomRef.current(atBottom);

        if (atTop) {
          setWantMoreRef.current(true);
          loadMoreRef.current();
        } else {
          setWantMoreRef.current(false);
        }

        // In anchored mode, trigger loadAfter when at bottom
        if (atBottom && windowModeRef.current === 'anchored') {
          loadAfterRef.current();
        }
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // --- Anchored mode: chain loads when still at an edge after entries change.
  // Covers two cases the scroll handler can't: (a) content doesn't fill
  // viewport so no scroll events fire, (b) the previous load appended/
  // prepended a small batch and the user is still within the edge threshold,
  // but no new scroll event fires because scroll position didn't change.
  useEffect(() => {
    if (windowMode.mode !== 'anchored') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const atBottom = distanceFromBottom <= AT_BOTTOM_THRESHOLD;
      const atTop = scrollTop <= AT_TOP_THRESHOLD;
      if (atBottom) loadAfter();
      if (atTop) loadMore();
    });
  }, [filteredEntries.length, windowMode.mode, loadAfter, loadMore]);

  // --- Follow-output / auto-scroll ---
  useEffect(() => {
    if (filteredEntries.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    if (scrollIntent === 'bottom-instant') {
      container.scrollTop = container.scrollHeight;
    } else if (scrollIntent === 'bottom-smooth' && isAtBottomRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [filteredEntries.length, scrollIntent]);

  // --- Track visible process ID for TOC highlight ---
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (virtualItems.length === 0) return;

    for (const item of virtualItems) {
      const entry = filteredEntries[item.index];
      if (
        entry &&
        entry.type === 'NORMALIZED_ENTRY' &&
        entry.content.entry_type.type === 'user_message'
      ) {
        onVisibleProcessIdChange?.(entry.executionProcessId);
        return;
      }
    }
  }, [virtualItems, filteredEntries, onVisibleProcessIdChange]);

  const context = useMemo(() => ({ attempt, task }), [attempt, task]);

  const renderItem = useCallback(
    (
      data: PatchTypeWithKey,
      ctx: { attempt: WorkspaceWithSession; task?: Task },
      isLast: boolean
    ) => {
      if (!data) return null;
      if (data.type === 'STDOUT') return <p>{data.content}</p>;
      if (data.type === 'STDERR') return <p>{data.content}</p>;
      if (data.type === 'NORMALIZED_ENTRY' && ctx.attempt) {
        return (
          <DisplayConversationEntry
            expansionKey={data.patchKey}
            entry={data.content}
            executionProcessId={data.executionProcessId}
            taskAttempt={ctx.attempt}
            task={ctx.task}
            isLastEntry={isLast}
          />
        );
      }
      return null;
    },
    []
  );

  const showJumpToBottom =
    scrollState === 'tail-browsing' || scrollState === 'anchored';
  const handleReturnToBottom = useCallback(() => {
    returnToBottom();
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [returnToBottom]);

  return (
    <ApprovalFormProvider>
      {initialLoading && (
        <div className="absolute inset-0 bg-primary flex flex-col gap-2 justify-center items-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
      {isJumping && (
        <div className="absolute inset-0 bg-primary/50 flex justify-center items-center z-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        {isLoadingBefore && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-muted rounded-full p-2 shadow">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {isLoadingAfter && windowMode.mode === 'anchored' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 bg-muted rounded-full p-2 shadow">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <div
          ref={scrollContainerRef}
          className="h-full overflow-y-auto"
          style={{ overflowAnchor: 'none' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
              }}
            >
              {virtualItems.map((virtualRow) => {
                const entry = filteredEntries[virtualRow.index];
                const isLast = virtualRow.index === filteredEntries.length - 1;
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                  >
                    {renderItem(entry, context, isLast)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {showJumpToBottom && (
          <button
            onClick={handleReturnToBottom}
            className="absolute bottom-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-muted border border-border shadow-lg hover:bg-accent transition-colors"
          >
            <ChevronDown className="h-5 w-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-xs px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
