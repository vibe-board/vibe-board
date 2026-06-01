import type { NormalizedEntry, ToolStat, ToolUsageStats } from 'shared/types';

interface Accumulator {
  count: number;
  success: number;
  failed: number;
  denied: number;
  timed_out: number;
  in_progress: number;
  count_with_timing: number;
  total_seconds: number;
  max_seconds: number;
  awaiting_approval_seconds: number;
  approved_call_count: number;
}

function emptyAccumulator(): Accumulator {
  return {
    count: 0,
    success: 0,
    failed: 0,
    denied: 0,
    timed_out: 0,
    in_progress: 0,
    count_with_timing: 0,
    total_seconds: 0,
    max_seconds: 0,
    awaiting_approval_seconds: 0,
    approved_call_count: 0,
  };
}

function durationSeconds(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, (end - start) / 1000);
}

export function aggregateToolUsageStats(
  entries: NormalizedEntry[],
  taskDurationSeconds: number | null
): ToolUsageStats | null {
  const buckets = new Map<string, Accumulator>();

  for (const entry of entries) {
    if (entry.entry_type.type !== 'tool_use') continue;
    const tu = entry.entry_type;
    const acc = buckets.get(tu.tool_name) ?? emptyAccumulator();
    acc.count += 1;

    switch (tu.status.status) {
      case 'success':
        acc.success += 1;
        break;
      case 'failed':
        acc.failed += 1;
        break;
      case 'denied':
        acc.denied += 1;
        break;
      case 'timed_out':
        acc.timed_out += 1;
        break;
      default:
        // Created / PendingApproval don't increment any terminal counter
        break;
    }

    const startedAt = tu.started_at;
    const completedAt = tu.completed_at;
    const approvedAt = tu.approved_at;

    if (startedAt && !completedAt) {
      acc.in_progress += 1;
    }

    if (startedAt && completedAt) {
      const dur = durationSeconds(startedAt, completedAt);
      acc.count_with_timing += 1;
      acc.total_seconds += dur;
      if (dur > acc.max_seconds) acc.max_seconds = dur;
    }

    if (startedAt && approvedAt) {
      acc.awaiting_approval_seconds += durationSeconds(startedAt, approvedAt);
      acc.approved_call_count += 1;
    }

    buckets.set(tu.tool_name, acc);
  }

  if (buckets.size === 0) return null;

  const per_tool: ToolStat[] = Array.from(buckets.entries())
    .map(
      ([tool_name, acc]): ToolStat => ({
        tool_name,
        count: acc.count,
        success: acc.success,
        failed: acc.failed,
        denied: acc.denied,
        timed_out: acc.timed_out,
        in_progress: acc.in_progress,
        total_seconds: acc.total_seconds,
        avg_seconds:
          acc.count_with_timing > 0
            ? acc.total_seconds / acc.count_with_timing
            : 0,
        max_seconds: acc.max_seconds,
        awaiting_approval_seconds: acc.awaiting_approval_seconds,
        approved_call_count: acc.approved_call_count,
      })
    )
    .sort((a, b) => b.total_seconds - a.total_seconds);

  const total_calls = per_tool.reduce((acc, t) => acc + t.count, 0);
  const total_seconds = per_tool.reduce((acc, t) => acc + t.total_seconds, 0);

  return {
    per_tool,
    total_calls,
    total_seconds,
    task_duration_seconds: taskDurationSeconds,
  };
}
