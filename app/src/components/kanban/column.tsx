import { For, Show, type Component } from 'solid-js';
import { KanbanCard } from './card';
import { QuickAdd } from './quick-add';
import { StatusDot } from '@/components/ui/badge';
import type { TaskWithAttemptStatus, TaskStatus } from '@/api/types';

interface KanbanColumnProps {
  status: TaskStatus;
  label: string;
  tasks: TaskWithAttemptStatus[];
  projectId: string;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onTaskCreated: () => void;
}

export const KanbanColumn: Component<KanbanColumnProps> = (props) => {
  return (
    <div class="flex flex-col min-w-[280px] w-[280px] shrink-0">
      <div class="flex items-center gap-2 px-2 py-2 mb-2">
        <StatusDot status={props.status} />
        <span class="text-sm font-medium text-foreground">{props.label}</span>
        <span class="text-xs text-subtle ml-auto">{props.tasks.length}</span>
      </div>
      <div class="flex-1 space-y-1.5 overflow-y-auto px-0.5 pb-2">
        <For each={props.tasks}>
          {(task) => (
            <KanbanCard
              task={task}
              onStatusChange={props.onStatusChange}
            />
          )}
        </For>
      </div>
      <Show when={props.status === 'todo'}>
        <QuickAdd
          projectId={props.projectId}
          onCreated={props.onTaskCreated}
        />
      </Show>
    </div>
  );
};
