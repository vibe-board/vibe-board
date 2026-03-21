import { Show, type Component } from 'solid-js';
import { A } from '@solidjs/router';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/date';
import type { TaskWithAttemptStatus, TaskStatus } from '@/api/types';

interface KanbanCardProps {
  task: TaskWithAttemptStatus;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

export const KanbanCard: Component<KanbanCardProps> = (props) => {
  return (
    <A
      href={`/projects/${props.task.project_id}/tasks/${props.task.id}`}
      class="block rounded-lg border border-border bg-surface p-3 hover:border-border-strong transition-colors cursor-default"
    >
      <div class="text-sm font-medium text-foreground leading-snug mb-2 line-clamp-2">
        {props.task.title}
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <Show when={props.task.executor}>
          <Badge variant="muted">{props.task.executor}</Badge>
        </Show>
        <Show when={props.task.has_in_progress_attempt}>
          <Badge variant="warning">Running</Badge>
        </Show>
        <Show when={props.task.last_attempt_failed}>
          <Badge variant="danger">Failed</Badge>
        </Show>
      </div>
      <div class="mt-2 text-[10px] text-subtle">
        {formatRelativeTime(props.task.created_at)}
      </div>
    </A>
  );
};
