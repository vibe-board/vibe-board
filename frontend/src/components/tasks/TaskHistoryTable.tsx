import { memo } from 'react';
import { useTaskHistory } from '@/hooks/useTaskHistory';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task } from 'shared/types';
import { formatRelativeTime } from '@/utils/date';

interface TaskHistoryTableProps {
  projectId: string;
  onViewTaskDetails: (task: Task) => void;
  selectedTaskId?: string;
}

function TaskHistoryTable({
  projectId,
  onViewTaskDetails,
  selectedTaskId,
}: TaskHistoryTableProps) {
  const { tasks, isLoading, hasMore, totalCount, loadMore, isLoadingMore } =
    useTaskHistory(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No completed tasks yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="text-xs text-muted-foreground px-2 pb-2">
        {totalCount} completed task{totalCount !== 1 ? 's' : ''}
      </div>
      {tasks.map((task) => (
        <button
          key={task.id}
          onClick={() => onViewTaskDetails(task)}
          className={`text-left px-3 py-2 rounded hover:bg-accent transition-colors ${
            selectedTaskId === task.id ? 'bg-accent' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm truncate flex-1">{task.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatRelativeTime(task.created_at)}
            </span>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {task.description}
            </p>
          )}
        </button>
      ))}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={loadMore}
          disabled={isLoadingMore}
          className="mt-2"
        >
          {isLoadingMore ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Load more
        </Button>
      )}
    </div>
  );
}

export default memo(TaskHistoryTable);
