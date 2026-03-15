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
  // pagingLoading: thin top bar for loading additional history batches
  const [pagingLoading, setPagingLoading] = useState(false);
  const { setEntries, reset } = useEntries();
  // Track previous data length for scroll position preservation
  const prevDataLengthRef = useRef(0);

  useEffect(() => {
    setInitialLoading(true);
    setPagingLoading(false);
    setChannelData(null);
    prevDataLengthRef.current = 0;
    reset();
  }, [attempt.id, reset]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
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
      setPagingLoading(newLoading);
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

    if (initialLoading && addType === 'initial') {
      // First batch arrived — dismiss full-screen overlay
      setInitialLoading(false);
    }

    // Show paging indicator while initial batches are loading
    if (addType === 'initial') {
      setPagingLoading(newLoading);
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
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const [sentinelVisible, setSentinelVisible] = useState(false);

  // Handle scroll to top - trigger loadMore using IntersectionObserver
  useEffect(() => {
    if (!hasMore || !loadMore) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0]?.isIntersecting ?? false;
        setSentinelVisible(isIntersecting);
        if (isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // Sentinel component for detecting scroll to top
  const LoadMoreHeader = useCallback(() => {
    return (
      <div ref={loadMoreSentinelRef} className="h-2">
        {sentinelVisible && (hasMore || isLoadingMore) && (
          <div className="w-full flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }, [hasMore, isLoadingMore, sentinelVisible]);

  return (
    <ApprovalFormProvider>
      {initialLoading && (
        <div className="absolute inset-0 bg-primary flex flex-col gap-2 justify-center items-center z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
      {pagingLoading && (
        <div className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
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
