import { useDraggable } from '@dnd-kit/core';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type Task, type TaskStatus } from '@/lib/store/taskStore';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

const statusVariant: Record<TaskStatus, 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled'> = {
  todo: 'todo',
  in_progress: 'inprogress',
  in_review: 'inreview',
  done: 'done',
  cancelled: 'cancelled',
};

const statusLabel: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded border border-border bg-surface-raised p-3 transition-colors hover:border-border-focus',
        isDragging && 'opacity-50'
      )}
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="text-sm font-medium text-text-primary line-clamp-2">
          {task.title}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant[task.status]}>
          {statusLabel[task.status]}
        </Badge>
        {task.tags?.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{new Date(task.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
