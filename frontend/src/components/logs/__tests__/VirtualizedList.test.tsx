import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import VirtualizedList from '../VirtualizedList';
import type { WorkspaceWithSession } from '@/types/attempt';

const mocks = vi.hoisted(() => ({
  conversationWindow: {
    entries: [],
    hasMore: false,
    isLoadingMore: false,
    isLoadingBefore: false,
    isLoadingAfter: false,
    loadMore: vi.fn(),
    setWantMore: vi.fn(),
    scrollIntent: 'none',
    initialLoading: true,
    onAtBottom: vi.fn(),
    lastPrependCountRef: { current: 0 },
    windowMode: { mode: 'tail' },
    scrollState: 'tail-following',
    jumpTo: vi.fn(),
    returnToBottom: vi.fn(),
    loadAfter: vi.fn(),
    unreadCount: 0,
    isJumping: false,
  },
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/contexts/EntriesContext', () => ({
  useEntries: () => ({
    setEntries: vi.fn(),
    reset: vi.fn(),
    setTokenUsageInfo: vi.fn(),
  }),
}));

vi.mock('@/hooks/useConversationHistory', () => ({
  useConversationWindow: () => mocks.conversationWindow,
}));

vi.mock('@/contexts/ApprovalFormContext', () => ({
  ApprovalFormProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('../../../NormalizedConversation/DisplayConversationEntry', () => ({
  default: () => <div data-testid="conversation-entry" />,
}));

// Mock useVirtualizer — JSDOM has no layout engine so measurements are impossible
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

const mockAttempt = {
  id: 'attempt-1',
} as unknown as WorkspaceWithSession;

describe('VirtualizedList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.conversationWindow, {
      entries: [],
      hasMore: false,
      isLoadingMore: false,
      isLoadingBefore: false,
      isLoadingAfter: false,
      loadMore: vi.fn(),
      setWantMore: vi.fn(),
      scrollIntent: 'none',
      initialLoading: true,
      onAtBottom: vi.fn(),
      lastPrependCountRef: { current: 0 },
      windowMode: { mode: 'tail' },
      scrollState: 'tail-following',
      jumpTo: vi.fn(),
      returnToBottom: vi.fn(),
      loadAfter: vi.fn(),
      unreadCount: 0,
      isJumping: false,
    });
  });

  it('renders loading overlay when initialLoading is true', () => {
    const { getByText } = render(<VirtualizedList attempt={mockAttempt} />);
    expect(getByText('Loading History')).toBeInTheDocument();
  });

  it('renders scroll container with correct structure', () => {
    const { container } = render(<VirtualizedList attempt={mockAttempt} />);

    // Should have a scroll container with overflow-y-auto
    const scrollContainer = container.querySelector('.overflow-y-auto');
    expect(scrollContainer).toBeInTheDocument();
  });

  it('scrolls the container to the bottom when the jump-to-bottom FAB is clicked', () => {
    const returnToBottom = vi.fn();
    Object.assign(mocks.conversationWindow, {
      initialLoading: false,
      scrollState: 'tail-browsing',
      returnToBottom,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    const { container } = render(<VirtualizedList attempt={mockAttempt} />);
    const scrollContainer = container.querySelector(
      '.overflow-y-auto'
    ) as HTMLDivElement;
    const scrollTo = vi.fn();
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      value: 1234,
      configurable: true,
    });
    scrollContainer.scrollTo = scrollTo;

    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    fireEvent.click(button!);

    expect(returnToBottom).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 1234,
      behavior: 'smooth',
    });
  });
});
