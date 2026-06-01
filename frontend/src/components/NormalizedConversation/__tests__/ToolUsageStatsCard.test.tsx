import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ToolUsageStats } from 'shared/types';
import { ToolUsageStatsCard } from '../ToolUsageStatsCard';

const baseStats: ToolUsageStats = {
  per_tool: [
    {
      tool_name: 'Bash',
      count: 12,
      success: 11,
      failed: 1,
      denied: 0,
      timed_out: 0,
      in_progress: 0,
      total_seconds: 8.2,
      avg_seconds: 0.7,
      max_seconds: 3.1,
      awaiting_approval_seconds: 5.1,
      approved_call_count: 3,
    },
    {
      tool_name: 'Read',
      count: 6,
      success: 6,
      failed: 0,
      denied: 0,
      timed_out: 0,
      in_progress: 0,
      total_seconds: 0.4,
      avg_seconds: 0.07,
      max_seconds: 0.2,
      awaiting_approval_seconds: 0,
      approved_call_count: 0,
    },
  ],
  total_calls: 18,
  total_seconds: 8.6,
  task_duration_seconds: 100,
};

describe('ToolUsageStatsCard', () => {
  it('renders collapsed header with count, total, and percentage', () => {
    render(<ToolUsageStatsCard stats={baseStats} />);
    expect(screen.getByText(/Tool calls 18/)).toBeInTheDocument();
    expect(screen.getByText(/9% of task/)).toBeInTheDocument();
    // Table is not rendered when collapsed
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('expands to a table with one row per tool when clicked', () => {
    render(<ToolUsageStatsCard stats={baseStats} />);
    fireEvent.click(screen.getByText(/Tool calls 18/));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('renders the † footnote only for tools with approved_call_count > 0', () => {
    render(<ToolUsageStatsCard stats={baseStats} />);
    fireEvent.click(screen.getByText(/Tool calls 18/));
    expect(
      screen.getByText(/3 of 12 call(s)? awaited approval/)
    ).toBeInTheDocument();
    // Read should not have a footnote line
    expect(screen.queryByText(/Read.*awaited approval/)).toBeNull();
  });

  it('hides "% of task" when task_duration_seconds is null', () => {
    render(
      <ToolUsageStatsCard
        stats={{ ...baseStats, task_duration_seconds: null }}
      />
    );
    expect(screen.queryByText(/% of task/)).toBeNull();
  });

  it('shows in-progress count in header when any tool has in_progress > 0', () => {
    const withInProgress: ToolUsageStats = {
      ...baseStats,
      per_tool: [
        { ...baseStats.per_tool[0], in_progress: 2 },
        baseStats.per_tool[1],
      ],
    };
    render(<ToolUsageStatsCard stats={withInProgress} />);
    expect(screen.getByText(/2 in progress/)).toBeInTheDocument();
  });
});
