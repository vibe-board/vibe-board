import {
  type ComponentType,
  type ReactElement,
  type Ref,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Virtuoso, VirtuosoHandle, type ListRange } from 'react-virtuoso';

// ---------------------------------------------------------------------------
// Types — drop-in replacements for @virtuoso.dev/message-list
// ---------------------------------------------------------------------------

export type ScrollModifier =
  | {
      type: 'item-location';
      location: {
        index: number | 'LAST';
        align: 'start' | 'center' | 'end';
      };
      purgeItemSizes?: boolean;
    }
  | {
      type: 'auto-scroll-to-bottom';
      autoScroll?: 'smooth' | 'auto';
    };

export interface DataWithScrollModifier<T> {
  data: T[];
  scrollModifier: ScrollModifier;
}

export interface VirtuosoMessageListMethods<T> {
  scrollToItem: (opts: {
    index: number | 'LAST';
    align?: 'start' | 'center' | 'end';
    behavior?: 'smooth' | 'auto';
  }) => void;
  data: {
    getCurrentlyRendered: () => T[];
    replace: (
      newData: T[],
      opts?: {
        purgeItemSizes?: boolean;
        initialLocation?: {
          index: number;
          align: 'start' | 'center' | 'end';
        };
      }
    ) => void;
  };
}

export interface VirtuosoMessageListProps<T, C> {
  data: DataWithScrollModifier<T> | null;
  initialLocation?: {
    index: number | 'LAST';
    align: 'start' | 'center' | 'end';
  };
  context?: C;
  computeItemKey: (params: { data: T }) => string;
  ItemContent: ComponentType<{ data: T; context: C }>;
  Header?: ComponentType;
  Footer?: ComponentType;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function VirtuosoMessageListInner<T, C>(
  props: VirtuosoMessageListProps<T, C>,
  ref: Ref<VirtuosoMessageListMethods<T>>
) {
  const {
    data: dataWithModifier,
    initialLocation,
    context,
    computeItemKey: computeItemKeyProp,
    ItemContent,
    Header,
    Footer,
    className,
  } = props;

  const [items, setItems] = useState<T[]>([]);
  const [followMode, setFollowMode] = useState<false | 'smooth' | 'auto'>(
    false
  );
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const visibleRangeRef = useRef<ListRange>({ startIndex: 0, endIndex: -1 });
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;
  const isFirstData = useRef(true);
  const pendingScrollRef = useRef<{
    index: number;
    align: 'start' | 'center' | 'end';
  } | null>(null);

  // Process data + scrollModifier when they change
  useEffect(() => {
    if (!dataWithModifier) return;
    const { data: newItems, scrollModifier } = dataWithModifier;

    setItems(newItems);
    itemsRef.current = newItems;

    if (scrollModifier.type === 'auto-scroll-to-bottom') {
      setFollowMode(scrollModifier.autoScroll ?? 'smooth');
    } else if (scrollModifier.type === 'item-location') {
      setFollowMode(false);
      // On first data load, initialTopMostItemIndex handles positioning.
      // On subsequent updates, we need an imperative scroll.
      if (!isFirstData.current) {
        const targetIndex =
          scrollModifier.location.index === 'LAST'
            ? newItems.length - 1
            : scrollModifier.location.index;
        requestAnimationFrame(() => {
          virtuosoRef.current?.scrollToIndex({
            index: targetIndex,
            align: scrollModifier.location.align,
          });
        });
      }
    }

    isFirstData.current = false;
  }, [dataWithModifier]);

  // Execute pending scroll from data.replace() after Virtuoso layout
  useLayoutEffect(() => {
    if (!pendingScrollRef.current) return;
    const scroll = pendingScrollRef.current;
    pendingScrollRef.current = null;
    setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({
        index: scroll.index,
        align: scroll.align,
      });
    }, 0);
  }, [items]);

  // Track visible range
  const handleRangeChanged = useCallback((range: ListRange) => {
    visibleRangeRef.current = range;
  }, []);

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    scrollToItem: ({ index, align = 'start', behavior = 'auto' }) => {
      const resolvedIndex =
        index === 'LAST' ? itemsRef.current.length - 1 : index;
      virtuosoRef.current?.scrollToIndex({
        index: resolvedIndex,
        align,
        behavior,
      });
    },
    data: {
      getCurrentlyRendered: () => {
        const { startIndex, endIndex } = visibleRangeRef.current;
        if (endIndex < startIndex) return [];
        return itemsRef.current.slice(startIndex, endIndex + 1);
      },
      replace: (newData, opts) => {
        setItems(newData);
        itemsRef.current = newData;
        if (opts?.initialLocation) {
          pendingScrollRef.current = opts.initialLocation;
        }
      },
    },
  }));

  // Compute initialTopMostItemIndex from initialLocation
  const initialTopMostItemIndex =
    initialLocation && items.length > 0
      ? initialLocation.index === 'LAST'
        ? items.length - 1
        : initialLocation.index
      : undefined;

  // Adapt computeItemKey: paid API uses ({ data }) => string,
  // free Virtuoso uses (index, item) => string
  const adaptedComputeItemKey = useCallback(
    (_index: number, item: T) => computeItemKeyProp({ data: item }),
    [computeItemKeyProp]
  );

  // Adapt followOutput: only auto-scroll when user is at bottom
  const followOutput = useCallback(
    (isAtBottom: boolean) => {
      if (followMode && isAtBottom) return followMode;
      return false;
    },
    [followMode]
  );

  // Adapt itemContent: Virtuoso passes (index, item, context)
  const itemContent = useCallback(
    (_index: number, item: T, ctx: C) => (
      <ItemContent data={item} context={ctx} />
    ),
    [ItemContent]
  );

  // Build a stable components prop for Virtuoso.
  // Consumers may pass inline arrows (e.g. Footer={() => <div />}), which
  // would create a new object every render, causing Virtuoso to unmount/remount
  // Header & Footer — breaking IntersectionObserver sentinels inside Header.
  // We use refs so the wrapper components are stable across renders.
  const headerRef = useRef(Header);
  headerRef.current = Header;
  const footerRef = useRef(Footer);
  footerRef.current = Footer;

  const StableHeader = useCallback(() => {
    const H = headerRef.current;
    return H ? <H /> : null;
  }, []);

  const StableFooter = useCallback(() => {
    const F = footerRef.current;
    return F ? <F /> : null;
  }, []);

  const hasHeader = !!Header;
  const hasFooter = !!Footer;

  const components = useMemo(() => {
    const c: Record<string, ComponentType> = {};
    if (hasHeader) c.Header = StableHeader;
    if (hasFooter) c.Footer = StableFooter;
    return c;
    // Only rebuild when Header/Footer *presence* changes (not identity)
  }, [hasHeader, hasFooter, StableHeader, StableFooter]);

  // When data is null and no internal data exists, render an empty placeholder
  if (!dataWithModifier && items.length === 0) {
    return <div className={className} />;
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      className={className}
      data={items}
      context={context}
      computeItemKey={adaptedComputeItemKey}
      initialTopMostItemIndex={initialTopMostItemIndex}
      followOutput={followOutput}
      rangeChanged={handleRangeChanged}
      increaseViewportBy={{ top: 200, bottom: 200 }}
      itemContent={itemContent}
      components={components}
    />
  );
}

// Cast forwardRef to preserve generics
export const VirtuosoMessageList = forwardRef(VirtuosoMessageListInner) as <
  T,
  C,
>(
  props: VirtuosoMessageListProps<T, C> & {
    ref?: Ref<VirtuosoMessageListMethods<T>>;
  }
) => ReactElement;
