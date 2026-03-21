import { For, createResource, type Component } from 'solid-js';
import { KanbanColumn } from './column';
import { useParams } from '@solidjs/router';
import { tasksApi } from '@/api/endpoints/tasks';
import type { TaskStatus } from '@/api/types';

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'Todo' },
  { status: 'inprogress', label: 'In Progress' },
  { status: 'inreview', label: 'In Review' },
  { status: 'done', label: 'Done' },
  { status: 'cancelled', label: 'Cancelled' },
];

export const KanbanBoard: Component = () => {
  const params = useParams<{ id: string }>();
  const [tasks, { refetch }] = createResource(
    () => params.id,
    (projectId) => tasksApi.list(projectId),
  );

  const tasksByStatus = (status: TaskStatus) =>
    (tasks() ?? []).filter((t) => t.status === status);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    await tasksApi.update(taskId, {
      title: null,
      description: null,
      status: newStatus,
      parent_workspace_id: null,
      image_ids: null,
    });
    refetch();
  };

  return (
    <div class="flex gap-3 h-full p-4 overflow-x-auto">
      <For each={COLUMNS}>
        {(col) => (
          <KanbanColumn
            status={col.status}
            label={col.label}
            tasks={tasksByStatus(col.status)}
            onStatusChange={handleStatusChange}
            projectId={params.id}
            onTaskCreated={refetch}
          />
        )}
      </For>
    </div>
  );
};
