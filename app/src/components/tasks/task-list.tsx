import { For, type Component } from 'solid-js';
import { A } from '@solidjs/router';
import { StatusDot } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/date';
import type { TaskWithAttemptStatus } from '@/api/types';

export const TaskList: Component<{
  tasks: TaskWithAttemptStatus[];
  projectId: string;
}> = (props) => {
  return (
    <div class="divide-y divide-border">
      <For each={props.tasks}>
        {(task) => (
          <A
            href={`/projects/${props.projectId}/tasks/${task.id}`}
            class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
          >
            <StatusDot status={task.status} />
            <span class="flex-1 text-sm text-foreground truncate">
              {task.title}
            </span>
            <span class="text-xs text-subtle shrink-0">
              {formatRelativeTime(task.created_at)}
            </span>
          </A>
        )}
      </For>
    </div>
  );
};
