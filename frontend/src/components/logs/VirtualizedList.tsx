import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

interface ItemContext {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

const TopLoader = () => (
  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>Loading more...</span>
  </div>
);

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const {
    entries,
    firstItemIndex,
    isLoadingMore,
    loadMore,
    setWantMore,
    scrollIntent,
    initialLoading,
  } = useConversationHistory({ attempt });

  const { setEntries, reset } = useEntries();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Reset EntriesContext when attempt changes
  useEffect(() => {
    reset();
  }, [attempt.id, reset]);

  // Sync entries to EntriesContext
  useEffect(() => {
    setEntries(entries);
  }, [entries, setEntries]);

  // followOutput derived from scrollIntent
  const followOutput = useCallback(
    (isAtBottom: boolean) => {
      if (scrollIntent === 'bottom-instant') return 'auto';
      if (scrollIntent === 'bottom-smooth' && isAtBottom) return 'smooth';
      return false;
    },
    [scrollIntent]
  );

  // When user reaches top, signal the hook to keep loading continuously.
  // When user leaves top, stop the continuous loop.
  const handleAtTopStateChange = useCallback(
    (isAtTop: boolean) => {
      setWantMore(isAtTop);
      if (isAtTop) loadMore();
    },
    [loadMore, setWantMore]
  );

  // startReached fires when the user scrolls to the very first item.
  // Belt-and-suspenders: atTopStateChange may not re-fire after firstItemIndex
  // changes, but startReached reliably fires when item at firstItemIndex is visible.
  const handleStartReached = useCallback(() => {
    setWantMore(true);
    loadMore();
  }, [loadMore, setWantMore]);

  const context = useMemo<ItemContext>(
    () => ({ attempt, task }),
    [attempt, task]
  );

  // Stable component reference — Virtuoso Header renders inline above list items,
  // so it doesn't overlap content. The component itself is stable; Virtuoso
  // re-renders it when the parent re-renders (which happens when isLoadingMore changes).
  const virtuosoComponents = useMemo(
    () => ({
      Header: isLoadingMore ? TopLoader : undefined,
    }),
    [isLoadingMore]
  );

  const computeItemKey = useCallback(
    (_index: number, item: PatchTypeWithKey) =>
      `l-${item?.patchKey ?? 'unknown'}`,
    []
  );

  const itemContent = useCallback(
    (_index: number, data: PatchTypeWithKey, ctx: ItemContext) => {
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
          />
        );
      }
      return null;
    },
    []
  );

  return (
    <ApprovalFormProvider>
      {initialLoading && (
        <div className="absolute inset-0 bg-primary flex flex-col gap-2 justify-center items-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
      <Virtuoso<PatchTypeWithKey, ItemContext>
        ref={virtuosoRef}
        className="flex-1"
        data={entries}
        context={context}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={
          entries.length > 0 ? entries.length - 1 : undefined
        }
        followOutput={followOutput}
        atTopStateChange={handleAtTopStateChange}
        startReached={handleStartReached}
        computeItemKey={computeItemKey}
        itemContent={itemContent}
        components={virtuosoComponents}
        increaseViewportBy={{ top: 200, bottom: 200 }}
      />
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
