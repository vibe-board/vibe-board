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
import {
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { Task } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: Task;
}

const AT_BOTTOM_THRESHOLD = 50;
const AT_TOP_THRESHOLD = 100;

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const {
    entries,
    loadMore,
    setWantMore,
    scrollIntent,
    initialLoading,
    isLoadingMore,
    onAtBottom,
    lastPrependCountRef,
  } = useConversationHistory({ attempt });

  const { setEntries, reset } = useEntries();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevTotalSizeRef = useRef(0);
  const isAtBottomRef = useRef(true);

  // Reset EntriesContext when attempt changes
  useEffect(() => {
    reset();
  }, [attempt.id, reset]);

  // Sync entries to EntriesContext
  useEffect(() => {
    setEntries(entries);
  }, [entries, setEntries]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (i) => entries[i]?.patchKey ?? `idx-${i}`,
  });

  // --- Prepend scroll compensation ---
  // After React commits DOM changes from a prepend, shift scrollTop
  // by the height delta so the user's viewport stays in place.
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
  }, [entries, virtualizer, lastPrependCountRef]);

  // Track totalSize for next prepend compensation
  useEffect(() => {
    prevTotalSizeRef.current = virtualizer.getTotalSize();
  });

  // --- Scroll event: at-top / at-bottom detection ---
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
        onAtBottom(atBottom);

        if (atTop) {
          setWantMore(true);
          loadMore();
        } else {
          setWantMore(false);
        }
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [loadMore, setWantMore, onAtBottom]);

  // --- Follow-output / auto-scroll ---
  useEffect(() => {
    if (entries.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    if (scrollIntent === 'bottom-instant') {
      // Use raw scrollTop instead of scrollToIndex — the virtualizer's
      // totalSize may be based on estimateSize for unmeasured items,
      // so scrollToIndex can overshoot past the real content.
      container.scrollTop = container.scrollHeight;
    } else if (scrollIntent === 'bottom-smooth' && isAtBottomRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [entries.length, scrollIntent]);

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

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <ApprovalFormProvider>
      {initialLoading && (
        <div className="absolute inset-0 bg-primary flex flex-col gap-2 justify-center items-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        {isLoadingMore && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-muted rounded-full p-2 shadow">
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
                const entry = entries[virtualRow.index];
                const isLast = virtualRow.index === entries.length - 1;
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
      </div>
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
