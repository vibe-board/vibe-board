import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  VirtualizedProcessLogs,
  type LogEntry,
} from '../VirtualizedProcessLogs';
import {
  capturedVirtuosoProps,
  mockScrollToIndex,
  resetVirtuosoMock,
} from '@/test-setup';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock RawLogText — render content for assertions
vi.mock('@/components/common/RawLogText', () => ({
  default: ({
    content,
    searchQuery,
    isCurrentMatch,
  }: {
    content: string;
    searchQuery?: string;
    isCurrentMatch?: boolean;
  }) => (
    <div
      data-testid="raw-log"
      data-search={searchQuery ?? ''}
      data-current-match={String(!!isCurrentMatch)}
    >
      {content}
    </div>
  ),
}));

// Mock the phosphor icon
vi.mock('@phosphor-icons/react/dist/ssr', () => ({
  WarningCircleIcon: ({ className }: { className: string }) => (
    <span className={className}>!</span>
  ),
}));

function makeLogEntries(count: number): LogEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    type: i % 2 === 0 ? 'STDOUT' : 'STDERR',
    content: `Line ${i}`,
    patchKey: `key-${i}`,
  })) as LogEntry[];
}

beforeEach(resetVirtuosoMock);

describe('VirtualizedProcessLogs', () => {
  it('renders log lines via VirtuosoMessageList', async () => {
    const logs = makeLogEntries(3);

    // The component uses a 100ms setTimeout before setting data
    vi.useFakeTimers();

    const { getAllByTestId } = render(
      <VirtualizedProcessLogs
        logs={logs}
        error={null}
        searchQuery=""
        matchIndices={[]}
        currentMatchIndex={-1}
      />
    );

    // Fast-forward the 100ms debounce
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const rawLogs = getAllByTestId('raw-log');
    expect(rawLogs).toHaveLength(3);
    expect(rawLogs[0]).toHaveTextContent('Line 0');
    expect(rawLogs[1]).toHaveTextContent('Line 1');
    expect(rawLogs[2]).toHaveTextContent('Line 2');

    vi.useRealTimers();
  });

  it('shows empty state when no logs and no error', () => {
    const { getByText } = render(
      <VirtualizedProcessLogs
        logs={[]}
        error={null}
        searchQuery=""
        matchIndices={[]}
        currentMatchIndex={-1}
      />
    );

    expect(getByText('processes.noLogsAvailable')).toBeInTheDocument();
  });

  it('shows error state', () => {
    const { getByText } = render(
      <VirtualizedProcessLogs
        logs={[]}
        error="Something went wrong"
        searchQuery=""
        matchIndices={[]}
        currentMatchIndex={-1}
      />
    );

    expect(getByText('Something went wrong')).toBeInTheDocument();
  });

  it('auto-scrolls to bottom when new logs arrive after initial load', async () => {
    vi.useFakeTimers();

    // Initial load uses item-location (scroll to bottom), not auto-scroll
    const logs = makeLogEntries(5);
    const { rerender } = render(
      <VirtualizedProcessLogs
        logs={logs}
        error={null}
        searchQuery=""
        matchIndices={[]}
        currentMatchIndex={-1}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Add more logs — this triggers auto-scroll-to-bottom modifier
    const moreLogs = makeLogEntries(10);
    rerender(
      <VirtualizedProcessLogs
        logs={moreLogs}
        error={null}
        searchQuery=""
        matchIndices={[]}
        currentMatchIndex={-1}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // After the second update, followOutput should auto-scroll
    const followOutput = capturedVirtuosoProps.followOutput as (
      isAtBottom: boolean
    ) => false | string;
    expect(followOutput(true)).toBe('smooth');
    expect(followOutput(false)).toBe(false);

    vi.useRealTimers();
  });

  it('highlights search matches and marks current match', async () => {
    vi.useFakeTimers();

    const logs = makeLogEntries(5);
    const { getAllByTestId } = render(
      <VirtualizedProcessLogs
        logs={logs}
        error={null}
        searchQuery="Line"
        matchIndices={[1, 3]}
        currentMatchIndex={0}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const rawLogs = getAllByTestId('raw-log');

    // Index 0 is not a match
    expect(rawLogs[0].dataset.search).toBe('');

    // Index 1 is a match and the current match
    expect(rawLogs[1].dataset.search).toBe('Line');
    expect(rawLogs[1].dataset.currentMatch).toBe('true');

    // Index 3 is a match but not the current match
    expect(rawLogs[3].dataset.search).toBe('Line');
    expect(rawLogs[3].dataset.currentMatch).toBe('false');

    vi.useRealTimers();
  });

  it('scrolls to current match when it changes', async () => {
    vi.useFakeTimers();

    const logs = makeLogEntries(20);
    const { rerender } = render(
      <VirtualizedProcessLogs
        logs={logs}
        error={null}
        searchQuery="Line"
        matchIndices={[5, 10, 15]}
        currentMatchIndex={0}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    mockScrollToIndex.mockClear();

    // Change current match to index 1 (logIndex = 10)
    rerender(
      <VirtualizedProcessLogs
        logs={logs}
        error={null}
        searchQuery="Line"
        matchIndices={[5, 10, 15]}
        currentMatchIndex={1}
      />
    );

    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 10,
      align: 'center',
      behavior: 'smooth',
    });

    vi.useRealTimers();
  });
});
