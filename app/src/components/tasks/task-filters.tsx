import { For, type Component } from 'solid-js';
import { cn } from '@/lib/cn';
import type { TaskStatus } from '@/api/types';

const statuses: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'Todo' },
  { value: 'inprogress', label: 'In Progress' },
  { value: 'inreview', label: 'In Review' },
  { value: 'done', label: 'Done' },
];

interface TaskFiltersProps {
  activeFilter: TaskStatus | 'all';
  onFilterChange: (status: TaskStatus | 'all') => void;
}

export const TaskFilters: Component<TaskFiltersProps> = (props) => {
  return (
    <div class="flex items-center gap-0.5 p-1 rounded-lg bg-surface-2">
      <For each={statuses}>
        {(s) => (
          <button
            class={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              props.activeFilter === s.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted hover:text-foreground',
            )}
            onClick={() => props.onFilterChange(s.value)}
          >
            {s.label}
          </button>
        )}
      </For>
    </div>
  );
};
