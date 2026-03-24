import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import VirtualizedList from '../VirtualizedList';
import type { WorkspaceWithSession } from '@/types/attempt';

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
  useConversationHistory: () => ({
    entries: [],
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    setWantMore: vi.fn(),
    scrollIntent: 'none',
    initialLoading: true,
    onAtBottom: vi.fn(),
    lastPrependCountRef: { current: 0 },
  }),
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
});
