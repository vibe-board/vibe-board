import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import {
  VirtuosoMessageList,
  type VirtuosoMessageListMethods,
  type DataWithScrollModifier,
} from '../virtuoso-message-list';
import {
  mockScrollToIndex,
  capturedVirtuosoProps,
  capturedRangeChanged,
  resetVirtuosoMock,
} from '@/test-setup';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestItem {
  id: string;
  text: string;
}

interface TestContext {
  highlight: boolean;
}

const TestItemContent = ({
  data,
  context,
}: {
  data: TestItem;
  context: TestContext;
}) => (
  <span data-testid={`content-${data.id}`}>
    {data.text}
    {context?.highlight ? ' [highlighted]' : ''}
  </span>
);

const testComputeItemKey = ({ data }: { data: TestItem }) => data.id;

function makeItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    text: `Text ${i}`,
  }));
}

function makeData(
  items: TestItem[],
  scrollModifier: DataWithScrollModifier<TestItem>['scrollModifier'] = {
    type: 'auto-scroll-to-bottom',
  }
): DataWithScrollModifier<TestItem> {
  return { data: items, scrollModifier };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(resetVirtuosoMock);

describe('VirtuosoMessageList', () => {
  // =========================================================================
  // Rendering & Props Adaptation
  // =========================================================================

  describe('Rendering', () => {
    it('renders items via ItemContent with { data, context }', () => {
      const { getByTestId } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(3), {
            type: 'auto-scroll-to-bottom',
            autoScroll: 'smooth',
          })}
          context={{ highlight: true }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      expect(getByTestId('content-item-0')).toHaveTextContent(
        'Text 0 [highlighted]'
      );
      expect(getByTestId('content-item-2')).toHaveTextContent(
        'Text 2 [highlighted]'
      );
    });

    it('adapts computeItemKey from ({ data }) signature', () => {
      render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(2))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      const adapted = capturedVirtuosoProps.computeItemKey as (
        index: number,
        item: TestItem
      ) => string;
      expect(adapted(0, { id: 'abc', text: '' })).toBe('abc');
    });

    it('renders Header and Footer', () => {
      const Header = () => <div data-testid="header">Header</div>;
      const Footer = () => <div data-testid="footer">Footer</div>;

      const { getByTestId } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(1))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
          Header={Header}
          Footer={Footer}
        />
      );

      expect(getByTestId('header')).toHaveTextContent('Header');
      expect(getByTestId('footer')).toHaveTextContent('Footer');
    });

    it('passes className through', () => {
      const { getByTestId } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(1))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
          className="flex-1 h-full"
        />
      );

      expect(getByTestId('mock-virtuoso')).toHaveClass('flex-1 h-full');
    });

    it('renders empty placeholder when data is null', () => {
      const { container, queryByTestId } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={null}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
          className="my-list"
        />
      );

      // Should render a plain div, not a Virtuoso
      expect(queryByTestId('mock-virtuoso')).not.toBeInTheDocument();
      expect(container.firstElementChild?.className).toBe('my-list');
    });
  });

  // =========================================================================
  // ScrollModifier Handling
  // =========================================================================

  describe('ScrollModifier', () => {
    it('auto-scroll-to-bottom sets followOutput', () => {
      render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(5), {
            type: 'auto-scroll-to-bottom',
            autoScroll: 'smooth',
          })}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      const followOutput = capturedVirtuosoProps.followOutput as (
        isAtBottom: boolean
      ) => false | string;
      expect(followOutput(true)).toBe('smooth');
      expect(followOutput(false)).toBe(false);
    });

    it('item-location LAST scrolls on subsequent updates', async () => {
      const { rerender } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(5))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      mockScrollToIndex.mockClear();

      rerender(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(10), {
            type: 'item-location',
            location: { index: 'LAST', align: 'end' },
          })}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      await act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 9,
        align: 'end',
      });
    });

    it('item-location with numeric index scrolls correctly', async () => {
      const { rerender } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(3))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      mockScrollToIndex.mockClear();

      rerender(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(10), {
            type: 'item-location',
            location: { index: 5, align: 'start' },
          })}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      await act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 5,
        align: 'start',
      });
    });

    it('initial render uses initialTopMostItemIndex', () => {
      render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(10), {
            type: 'item-location',
            location: { index: 'LAST', align: 'end' },
          })}
          initialLocation={{ index: 'LAST', align: 'end' }}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      expect(capturedVirtuosoProps.initialTopMostItemIndex).toBe(9);
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Imperative API (ref methods)
  // =========================================================================

  describe('Imperative API', () => {
    it('scrollToItem delegates to scrollToIndex', () => {
      const ref = createRef<VirtuosoMessageListMethods<TestItem>>();

      render(
        <VirtuosoMessageList<TestItem, TestContext>
          ref={ref}
          data={makeData(makeItems(10))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      act(() => {
        ref.current!.scrollToItem({
          index: 5,
          align: 'center',
          behavior: 'smooth',
        });
      });

      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 5,
        align: 'center',
        behavior: 'smooth',
      });
    });

    it('scrollToItem resolves LAST to last item index', () => {
      const ref = createRef<VirtuosoMessageListMethods<TestItem>>();
      render(
        <VirtuosoMessageList<TestItem, TestContext>
          ref={ref}
          data={makeData(makeItems(8))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );
      act(() => {
        ref.current!.scrollToItem({ index: 'LAST', align: 'end' });
      });
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 7,
        align: 'end',
        behavior: 'auto',
      });
    });

    it('data.getCurrentlyRendered() returns visible items', () => {
      const ref = createRef<VirtuosoMessageListMethods<TestItem>>();
      const items = makeItems(10);

      render(
        <VirtuosoMessageList<TestItem, TestContext>
          ref={ref}
          data={makeData(items)}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      act(() => {
        capturedRangeChanged?.({ startIndex: 2, endIndex: 6 });
      });

      expect(ref.current!.data.getCurrentlyRendered()).toEqual(
        items.slice(2, 7)
      );
    });

    it('data.getCurrentlyRendered() returns [] before rangeChanged', () => {
      const ref = createRef<VirtuosoMessageListMethods<TestItem>>();

      render(
        <VirtuosoMessageList<TestItem, TestContext>
          ref={ref}
          data={makeData(makeItems(5))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      expect(ref.current!.data.getCurrentlyRendered()).toEqual([]);
    });

    it('data.replace() updates data and scrolls to anchor', async () => {
      const ref = createRef<VirtuosoMessageListMethods<TestItem>>();

      render(
        <VirtuosoMessageList<TestItem, TestContext>
          ref={ref}
          data={makeData(makeItems(3))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      mockScrollToIndex.mockClear();
      const newItems = makeItems(20);

      await act(async () => {
        ref.current!.data.replace(newItems, {
          initialLocation: { index: 10, align: 'start' },
        });
      });

      expect(capturedVirtuosoProps.data).toEqual(newItems);

      // useLayoutEffect + setTimeout(0) schedules scroll after Virtuoso layout
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 10,
        align: 'start',
      });
    });

    it('data.replace() without anchor does not scroll', async () => {
      const ref = createRef<VirtuosoMessageListMethods<TestItem>>();

      render(
        <VirtuosoMessageList<TestItem, TestContext>
          ref={ref}
          data={makeData(makeItems(3))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      mockScrollToIndex.mockClear();

      await act(async () => {
        ref.current!.data.replace(makeItems(10));
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockScrollToIndex).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('empty data array renders Virtuoso', () => {
      const { getByTestId, queryByTestId } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData([])}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      expect(getByTestId('mock-virtuoso')).toBeInTheDocument();
      expect(queryByTestId('item-0')).not.toBeInTheDocument();
    });

    it('single item renders correctly', () => {
      const { getByTestId } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData([{ id: 'only', text: 'Only item' }])}
          context={{ highlight: true }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      expect(getByTestId('content-only')).toHaveTextContent(
        'Only item [highlighted]'
      );
    });

    it('rapid updates use the latest data', () => {
      const { rerender } = render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(1))}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      for (let i = 2; i <= 5; i++) {
        rerender(
          <VirtuosoMessageList<TestItem, TestContext>
            data={makeData(makeItems(i))}
            context={{ highlight: false }}
            computeItemKey={testComputeItemKey}
            ItemContent={TestItemContent}
          />
        );
      }

      expect((capturedVirtuosoProps.data as TestItem[]).length).toBe(5);
    });

    it('initialLocation LAST computes correct index', () => {
      render(
        <VirtuosoMessageList<TestItem, TestContext>
          data={makeData(makeItems(7))}
          initialLocation={{ index: 'LAST', align: 'end' }}
          context={{ highlight: false }}
          computeItemKey={testComputeItemKey}
          ItemContent={TestItemContent}
        />
      );

      expect(capturedVirtuosoProps.initialTopMostItemIndex).toBe(6);
    });
  });
});
