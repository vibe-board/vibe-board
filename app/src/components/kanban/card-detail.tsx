import { Show, type Component } from 'solid-js';
import type { TaskWithAttemptStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';

export const CardDetail: Component<{ task: TaskWithAttemptStatus }> = (props) => {
  return (
    <div class="rounded-xl border border-border bg-surface p-4 shadow-md w-80">
      <h4 class="text-sm font-semibold text-foreground mb-2">
        {props.task.title}
      </h4>
      <Show when={props.task.description}>
        <p class="text-xs text-muted mb-3 line-clamp-4">
          {props.task.description}
        </p>
      </Show>
      <div class="flex items-center gap-2">
        <Badge variant="muted">{props.task.status}</Badge>
        <Show when={props.task.executor}>
          <Badge>{props.task.executor}</Badge>
        </Show>
      </div>
    </div>
  );
};
