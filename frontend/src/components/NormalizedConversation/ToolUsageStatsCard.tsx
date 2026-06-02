import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';

import type { ToolStat, ToolUsageStats } from 'shared/types';
import { formatDurationFine } from '@/utils/date';

interface Props {
  stats: ToolUsageStats;
}

/// "Has timing data" proxy: at least one call is not in_progress (i.e. some
/// call reached a terminal status), so total_seconds reflects real durations.
function hasTimingData(row: ToolStat): boolean {
  return row.in_progress < row.count;
}

export function ToolUsageStatsCard({ stats }: Props) {
  const [expanded, setExpanded] = useState(false);

  const inProgressTotal = stats.per_tool.reduce(
    (acc, t) => acc + t.in_progress,
    0
  );
  const percentOfTask =
    stats.task_duration_seconds && stats.task_duration_seconds > 0
      ? Math.round((stats.total_seconds / stats.task_duration_seconds) * 100)
      : null;

  const annotatedTools = stats.per_tool.filter(
    (t) => t.approved_call_count > 0
  );

  return (
    <div className="px-4 py-2 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Wrench className="h-3 w-3" />
        <span>
          Tool calls {stats.total_calls} · Total{' '}
          {formatDurationFine(stats.total_seconds)}
          {percentOfTask !== null && ` · ${percentOfTask}% of task`}
          {inProgressTotal > 0 && ` · ${inProgressTotal} in progress`}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 ml-5 rounded border border-border bg-background overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-2 py-1 font-medium">Tool</th>
                <th className="text-right px-2 py-1 font-medium">Count</th>
                <th className="text-right px-2 py-1 font-medium">✓ / ✗ / ⊘</th>
                <th className="text-right px-2 py-1 font-medium">Total</th>
                <th className="text-right px-2 py-1 font-medium">Avg</th>
                <th className="text-right px-2 py-1 font-medium">Max</th>
              </tr>
            </thead>
            <tbody>
              {stats.per_tool.map((row) => {
                const hasTiming = hasTimingData(row);
                return (
                  <tr
                    key={row.tool_name}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-2 py-1 font-mono">{row.tool_name}</td>
                    <td className="px-2 py-1 text-right">{row.count}</td>
                    <td
                      className="px-2 py-1 text-right"
                      title={`${row.success} success, ${row.failed} failed, ${row.denied} denied, ${row.timed_out} timed_out`}
                    >
                      {row.success} / {row.failed} / {row.denied}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {hasTiming ? formatDurationFine(row.total_seconds) : '—'}
                      {row.approved_call_count > 0 && ' †'}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {hasTiming ? formatDurationFine(row.avg_seconds) : '—'}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {hasTiming ? formatDurationFine(row.max_seconds) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {annotatedTools.length > 0 && (
            <div className="border-t border-border bg-muted/30 px-2 py-1 text-[11px]">
              {annotatedTools.map((row) => (
                <div key={row.tool_name}>
                  † {row.tool_name}: {row.approved_call_count} of {row.count}{' '}
                  call{row.count === 1 ? '' : 's'} awaited approval (
                  {formatDurationFine(row.awaiting_approval_seconds)} total)
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
