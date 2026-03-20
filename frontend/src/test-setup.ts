/// <reference types="vitest" />
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Browser API mocks
// ---------------------------------------------------------------------------

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver;

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

Element.prototype.scrollTo = vi.fn();

// ---------------------------------------------------------------------------
// Mock react-virtuoso
// ---------------------------------------------------------------------------

export const mockScrollToIndex = vi.fn();

/** Latest props passed to the mock Virtuoso. */
export let capturedVirtuosoProps: Record<string, unknown> = {};

/** rangeChanged callback captured from the mock — call it to simulate visible range. */
export let capturedRangeChanged:
  | ((range: { startIndex: number; endIndex: number }) => void)
  | null = null;

/** Reset captured state between tests. */
export function resetVirtuosoMock() {
  capturedVirtuosoProps = {};
  capturedRangeChanged = null;
  mockScrollToIndex.mockClear();
}

vi.mock('react-virtuoso', () => {
  const MockVirtuoso = React.forwardRef(function MockVirtuoso(
    props: Record<string, unknown>,
    ref: React.Ref<{ scrollToIndex: typeof mockScrollToIndex }>
  ) {
    capturedVirtuosoProps = props;
    if (typeof props.rangeChanged === 'function') {
      capturedRangeChanged = props.rangeChanged as typeof capturedRangeChanged;
    }
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: mockScrollToIndex,
    }));

    const data = props.data as unknown[] | undefined;
    const itemContent = props.itemContent as
      | ((index: number, item: unknown, context: unknown) => React.ReactNode)
      | undefined;
    const context = props.context;
    const components = props.components as {
      Header?: React.ComponentType;
      Footer?: React.ComponentType;
    };

    return React.createElement(
      'div',
      {
        'data-testid': 'mock-virtuoso',
        className: props.className as string,
      },
      components?.Header && React.createElement(components.Header),
      ...(data?.map((item, i) =>
        React.createElement(
          'div',
          { key: i, 'data-testid': `item-${i}` },
          itemContent?.(i, item, context)
        )
      ) ?? []),
      components?.Footer && React.createElement(components.Footer)
    );
  });
  return { Virtuoso: MockVirtuoso, VirtuosoHandle: {} };
});
