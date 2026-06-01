import { describe, expect, it } from 'vitest';

import type { NormalizedEntry } from 'shared/types';
import { aggregateToolUsageStats } from '../aggregateToolUsageStats';

describe('aggregateToolUsageStats', () => {
  it('returns null for empty entries', () => {
    expect(aggregateToolUsageStats([], null)).toBeNull();
  });

  it('returns null when no tool_use entries are present', () => {
    const entries: NormalizedEntry[] = [
      {
        entry_type: { type: 'assistant_message' },
        content: 'hi',
        timestamp: null,
      },
    ];
    expect(aggregateToolUsageStats(entries, null)).toBeNull();
  });

  function makeToolUse(overrides: {
    tool_name: string;
    statusType:
      | 'created'
      | 'success'
      | 'failed'
      | 'denied'
      | 'pending_approval'
      | 'timed_out';
    started_at?: string;
    approved_at?: string;
    completed_at?: string;
  }): NormalizedEntry {
    const status =
      overrides.statusType === 'denied'
        ? { status: 'denied' as const, reason: null }
        : overrides.statusType === 'pending_approval'
          ? { status: 'pending_approval' as const, approval_id: 'a' }
          : {
              status: overrides.statusType as Exclude<
                typeof overrides.statusType,
                'denied' | 'pending_approval'
              >,
            };

    return {
      entry_type: {
        type: 'tool_use',
        tool_name: overrides.tool_name,
        action_type: { action: 'other', description: '' },
        status,
        ...(overrides.started_at && { started_at: overrides.started_at }),
        ...(overrides.approved_at && { approved_at: overrides.approved_at }),
        ...(overrides.completed_at && { completed_at: overrides.completed_at }),
      },
      content: '',
      timestamp: null,
    };
  }

  it('aggregates a single tool with three success calls', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:00Z',
        completed_at: '2026-06-01T00:00:02Z',
      }),
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:10Z',
        completed_at: '2026-06-01T00:00:13Z',
      }),
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:20Z',
        completed_at: '2026-06-01T00:00:21Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, 100);

    expect(stats).not.toBeNull();
    expect(stats!.per_tool).toHaveLength(1);
    const bash = stats!.per_tool[0];
    expect(bash.tool_name).toBe('Bash');
    expect(bash.count).toBe(3);
    expect(bash.success).toBe(3);
    expect(bash.total_seconds).toBeCloseTo(2 + 3 + 1);
    expect(bash.avg_seconds).toBeCloseTo(2);
    expect(bash.max_seconds).toBeCloseTo(3);
    expect(bash.in_progress).toBe(0);
    expect(bash.awaiting_approval_seconds).toBe(0);
    expect(bash.approved_call_count).toBe(0);
    expect(stats!.total_calls).toBe(3);
    expect(stats!.total_seconds).toBeCloseTo(6);
    expect(stats!.task_duration_seconds).toBe(100);
  });

  it('groups by tool_name and splits status counts', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
      makeToolUse({ tool_name: 'Bash', statusType: 'failed' }),
      makeToolUse({ tool_name: 'Read', statusType: 'success' }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    const bash = stats.per_tool.find((t) => t.tool_name === 'Bash')!;
    const read = stats.per_tool.find((t) => t.tool_name === 'Read')!;
    expect(bash.count).toBe(3);
    expect(bash.success).toBe(2);
    expect(bash.failed).toBe(1);
    expect(read.count).toBe(1);
    expect(read.success).toBe(1);
  });

  it('counts entries with no started_at but excludes them from totals', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:00Z',
        completed_at: '2026-06-01T00:00:02Z',
      }),
      // Legacy: no timing fields
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    const bash = stats.per_tool[0];
    expect(bash.count).toBe(2);
    expect(bash.total_seconds).toBeCloseTo(2);
    expect(bash.avg_seconds).toBeCloseTo(2); // divided by count_with_timing=1
  });

  it('marks in_progress when started_at present but completed_at missing', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'created',
        started_at: '2026-06-01T00:00:00Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    expect(stats.per_tool[0].in_progress).toBe(1);
    expect(stats.per_tool[0].total_seconds).toBe(0);
  });

  it('sums awaiting_approval_seconds only over calls with approved_at', () => {
    const entries: NormalizedEntry[] = [
      // Approved call: 5s wait, total 6s
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:00Z',
        approved_at: '2026-06-01T00:00:05Z',
        completed_at: '2026-06-01T00:00:06Z',
      }),
      // Auto-approved call (no approval phase): 2s total
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:01:00Z',
        completed_at: '2026-06-01T00:01:02Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    const bash = stats.per_tool[0];
    expect(bash.approved_call_count).toBe(1);
    expect(bash.awaiting_approval_seconds).toBeCloseTo(5);
    expect(bash.total_seconds).toBeCloseTo(8);
  });

  it('clamps negative duration to zero (clock skew)', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:10Z',
        completed_at: '2026-06-01T00:00:00Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    expect(stats.per_tool[0].total_seconds).toBe(0);
    expect(stats.per_tool[0].max_seconds).toBe(0);
  });

  it('passes taskDurationSeconds through to the result', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
    ];
    expect(
      aggregateToolUsageStats(entries, null)!.task_duration_seconds
    ).toBeNull();
    expect(aggregateToolUsageStats(entries, 42)!.task_duration_seconds).toBe(
      42
    );
  });
});
