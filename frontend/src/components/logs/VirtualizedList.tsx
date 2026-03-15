import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
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

interface MessageListContext {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

const INITIAL_TOP_ITEM = { index: 'LAST' as const, align: 'end' as const };

const InitialDataScrollModifier: ScrollModifier = {
  type: 'item-location',
  location: INITIAL_TOP_ITEM,
  purgeItemSizes: true,
};

const AutoScrollToBottom: ScrollModifier = {
  type: 'auto-scroll-to-bottom',
  autoScroll: 'smooth',
};

const ItemContent: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['ItemContent'] = ({ data, context }) => {
  const attempt = context?.attempt;
  const task = context?.task;

  if (!data) return null;

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    return (
      <DisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        task={task}
      />
    );
  }

  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['computeItemKey'] = ({ data }) => `l-${data?.patchKey ?? 'unknown'}`;

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [channelData, setChannelData] =
    useState<DataWithScrollModifier<PatchTypeWithKey> | null>(null);
  // initialLoading: full-screen overlay for first load of a new attempt
  const [initialLoading, setInitialLoading] = useState(true);
  const { setEntries, reset } = useEntries();
  // Track previous data length for scroll position preservation
  const prevDataLengthRef = useRef(0);
  // Track whether we've received real conversation data (not just synthetic patches)
  const hasReceivedRealData = useRef(false);

  useEffect(() => {
    setInitialLoading(true);
    setChannelData(null);
    prevDataLengthRef.current = 0;
    hasReceivedRealData.current = false;
    reset();
  }, [attempt.id, reset]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType
  ) => {
    // For historic batch loading, use data.replace() with anchor to preserve scroll position
    if (addType === 'historic') {
      const messageList = messageListRef.current;
      if (messageList) {
        const rendered = messageList.data.getCurrentlyRendered();
        const anchorKey = rendered[0]?.patchKey;
        const anchorIndex = anchorKey
          ? newEntries.findIndex((item) => item.patchKey === anchorKey)
          : -1;
        messageList.data.replace(newEntries, {
          purgeItemSizes: true,
          initialLocation:
            anchorIndex >= 0
              ? { index: anchorIndex, align: 'start' }
              : undefined,
        });
      }
      setEntries(newEntries);
      prevDataLengthRef.current = newEntries.length;
      return;
    }

    let scrollModifier: ScrollModifier = InitialDataScrollModifier;

    if ((addType === 'running' || addType === 'plan') && !initialLoading) {
      scrollModifier = AutoScrollToBottom;
    }

    setChannelData({ data: newEntries, scrollModifier });
    setEntries(newEntries);
    prevDataLengthRef.current = newEntries.length;

    // Dismiss full-screen overlay only when we receive real conversation data.
    // The reset emit sends a synthetic next_action patch with addType='initial',
    // which we must ignore to keep the overlay visible until real data arrives.
    if (initialLoading && addType === 'initial' && !hasReceivedRealData.current) {
      // The reset emit produces only a synthetic next_action entry.
      // Dismiss the overlay once we see anything other than that.
      const onlySynthetic = newEntries.every(
        (e) =>
          e.type === 'NORMALIZED_ENTRY' &&
          e.content?.entry_type?.type === 'next_action'
      );
      if (!onlySynthetic && newEntries.length > 0) {
        hasReceivedRealData.current = true;
        setInitialLoading(false);
      }
    }
  };

  const { loadMore, hasMore, isLoadingMore } = useConversationHistory({
    attempt,
    onEntriesUpdated,
  });

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);
  const messageListContext = useMemo(
    () => ({ attempt, task }),
    [attempt, task]
  );
  // Use refs so the IntersectionObserver callback always sees the latest values
  // without needing to re-create the observer (which would lose the DOM node).
  const loadMoreRef = useRef(loadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  loadMoreRef.current = loadMore;
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;

  // Callback ref: whenever the sentinel DOM node is (re-)attached, set up a
  // fresh IntersectionObserver.  Because the callback captures no stale state
  // (it reads from refs), we never need to tear-down-and-recreate when
  // hasMore / loadMore change — the same observer just works.
  //
  // We use Virtuoso's own scroll container (the sentinel's nearest scrollable
  // ancestor) as the observer root.  This avoids ancestor overflow:hidden
  // (e.g. the resizable Panel when the diff view is open) from clipping the
  // sentinel's intersection rect and preventing the observer from firing.
  // Whether the sentinel (top of list) is currently visible in the viewport.
  // Used to only show the loading spinner when the user has scrolled to the top.
  const [sentinelVisible, setSentinelVisible] = useState(false);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;

    // Walk up to find Virtuoso's scroll container (first ancestor with
    // overflow auto/scroll).  This is always just 1-2 levels up from the
    // sentinel, well before any global scrollable element.
    let root: HTMLElement | null = node.parentElement;
    while (root) {
      const { overflow, overflowY } = getComputedStyle(root);
      if (/auto|scroll/.test(overflow + overflowY)) break;
      root = root.parentElement;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0]?.isIntersecting ?? false;
        setSentinelVisible(isIntersecting);
        if (
          isIntersecting &&
          hasMoreRef.current &&
          !isLoadingMoreRef.current &&
          loadMoreRef.current
        ) {
          loadMoreRef.current();
        }
      },
      { root, threshold: 0.1 }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  // Clean up on unmount
  useEffect(() => () => observerRef.current?.disconnect(), []);

  // Stable sentinel-only Header for Virtuoso. Must NEVER change reference so
  // Virtuoso doesn't unmount/remount the DOM node that hosts the
  // IntersectionObserver.  The loading spinner is rendered outside Virtuoso.
  const LoadMoreHeader = useCallback(() => {
    return <div ref={sentinelCallbackRef} className="h-2" />;
  }, [sentinelCallbackRef]);

  return (
    <ApprovalFormProvider>
      {initialLoading && (
        <div className="absolute inset-0 bg-primary flex flex-col gap-2 justify-center items-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
      {/* Loading spinner — absolute so it doesn't shift layout and cause flicker */}
      {!initialLoading && sentinelVisible && isLoadingMore && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading more...</span>
        </div>
      )}
      <VirtuosoMessageListLicense
        licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
      >
        <VirtuosoMessageList<PatchTypeWithKey, MessageListContext>
          ref={messageListRef}
          className="flex-1"
          data={channelData}
          initialLocation={INITIAL_TOP_ITEM}
          context={messageListContext}
          computeItemKey={computeItemKey}
          ItemContent={ItemContent}
          Header={LoadMoreHeader}
          Footer={() => <div className="h-2"></div>}
        />
      </VirtuosoMessageListLicense>
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
