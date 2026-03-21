import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';
import { type TaskStatus, useTaskStore } from '@/lib/store/taskStore';
import { ScrollArea } from '@/components/ui/scroll-area';

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'todo', title: 'To Do' },
  { status: 'in_progress', title: 'In Progress' },
  { status: 'in_review', title: 'In Review' },
  { status: 'done', title: 'Done' },
];

interface TaskBoardProps {
  onTaskClick?: (taskId: string) => void;
}

export function TaskBoard({ onTaskClick }: TaskBoardProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const overId = over.id as string;
    const targetColumn = COLUMNS.find((c) => c.status === overId);
    if (targetColumn) {
      updateTask(active.id as string, { status: targetColumn.status });
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-full">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.status);
          return (
            <div
              key={column.status}
              className="flex w-72 shrink-0 flex-col rounded border border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-medium text-text-secondary">
                  {column.title}
                </span>
                <span className="text-xs text-text-tertiary">
                  {columnTasks.length}
                </span>
              </div>
              <ScrollArea className="flex-1">
                <SortableContext
                  items={columnTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2 p-2">
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => onTaskClick?.(task.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
