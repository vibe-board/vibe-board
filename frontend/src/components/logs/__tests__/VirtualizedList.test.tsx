import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import VirtualizedList from '../VirtualizedList';
import { capturedVirtuosoProps, resetVirtuosoMock } from '@/test-setup';
import type { WorkspaceWithSession } from '@/types/attempt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/contexts/EntriesContext', () => ({
  useEntries: () => ({ setEntries: vi.fn(), reset: vi.fn() }),
}));

vi.mock('@/hooks/useConversationHistory', () => ({
  useConversationHistory: () => ({
    entries: [],
    firstItemIndex: 100_000,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    setWantMore: vi.fn(),
    scrollIntent: 'none',
    initialLoading: true,
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

const mockAttempt = {
  id: 'attempt-1',
} as unknown as WorkspaceWithSession;

beforeEach(resetVirtuosoMock);

describe('VirtualizedList', () => {
  it('renders Virtuoso with initial loading overlay', () => {
    const { getByText } = render(<VirtualizedList attempt={mockAttempt} />);

    // Should show loading overlay on initial render
    expect(getByText('Loading History')).toBeInTheDocument();
  });

  it('passes correct props to Virtuoso', () => {
    render(<VirtualizedList attempt={mockAttempt} />);

    // Virtuoso should receive firstItemIndex and data from the hook
    expect(capturedVirtuosoProps).toHaveProperty('firstItemIndex', 100_000);
    expect(capturedVirtuosoProps).toHaveProperty('data');
    expect(capturedVirtuosoProps).toHaveProperty('className', 'flex-1');
  });
});
