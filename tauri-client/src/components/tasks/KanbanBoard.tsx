import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import type { TaskStatus, Task } from '@shared/types';
import { useTaskStream } from '@/api/hooks/useTaskStream';
import { useTasks } from '@/api/hooks/useTasks';
import { TaskCard } from '@/components/tasks/TaskCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Search, X } from 'lucide-react';

const STATUSES: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const paramStatus = searchParams.get('status') as TaskStatus | null;
  const activeStatus: TaskStatus =
    paramStatus && STATUSES.includes(paramStatus) ? paramStatus : 'todo';

  const setActiveStatus = (status: TaskStatus) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('status', status);
      return next;
    }, { replace: true });
  };

  const { tasks: streamTasks, isInitialized } = useTaskStream(projectId);
  const { data: restTasks, isLoading } = useTasks(projectId, {
    enabled: !isInitialized,
  });

  const allTasks: Task[] = useMemo(
    () =>
      isInitialized
        ? Object.values(streamTasks ?? {})
        : (restTasks ?? []),
    [isInitialized, streamTasks, restTasks],
  );

  const filteredTasks = useMemo(
    () =>
      allTasks
        .filter((t) => {
          if (!searchQuery) return true;
          const query = searchQuery.toLowerCase();
          return (
            t.title.toLowerCase().includes(query) ||
            (t as { description?: string | null }).description
              ?.toLowerCase()
              .includes(query)
          );
        })
        .filter((t) => t.status === activeStatus),
    [allTasks, searchQuery, activeStatus],
  );

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<TaskStatus, number>> = {};
    for (const task of allTasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
    }
    return counts;
  }, [allTasks]);

  const handleTaskPress = (taskId: string) => {
    navigate(`/tasks/${taskId}?project_id=${encodeURIComponent(projectId)}`);
  };

  if (!isInitialized && isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('tasks.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[40px] rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Status switcher */}
      <div className="flex overflow-x-auto gap-1 px-4 py-2 border-b border-border shrink-0">
        {STATUSES.map((status) => {
          const count = statusCounts[status] ?? 0;
          const isActive = status === activeStatus;
          return (
            <button
              key={status}
              onClick={() => setActiveStatus(status)}
              className={`
                shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                whitespace-nowrap flex items-center gap-1.5
                ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground active:bg-muted/80'
                }
              `}
            >
              {t(`tasks.status.${status}`)}
              <span
                className={`
                  text-xs tabular-nums
                  ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/60'}
                `}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Task list */}
      <div className="flex-1">
        {filteredTasks.length === 0 ? (
          <EmptyState
            title={t('tasks.noTasks')}
            description={t('tasks.noTasksHint')}
          />
        ) : (
          <Virtuoso
            className="flex-1"
            data={filteredTasks}
            itemContent={(_index, task) => (
              <div className="px-4 py-1.5">
                <TaskCard task={task} onPress={handleTaskPress} />
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
