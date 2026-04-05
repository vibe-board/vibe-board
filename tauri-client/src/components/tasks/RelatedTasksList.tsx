import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTaskRelationships } from '@/api/hooks/useAttempts';
import type { Task } from '@shared/types';
import { Badge } from '@/components/ui/Badge';
import { FolderTree, ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';

function RelatedTaskCard({
  task,
  onPress,
}: {
  task: Task;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  const statusVariant: Record<string, string> = {
    todo: 'todo',
    inprogress: 'inprogress',
    inreview: 'inreview',
    done: 'done',
    cancelled: 'cancelled',
  };

  return (
    <button
      onClick={onPress}
      className="flex items-center gap-3 px-3 py-2.5 w-full text-left active:bg-muted/50 transition-colors rounded-md"
    >
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        {task.description && (
          <p className="text-xs text-muted-foreground truncate">
            {task.description}
          </p>
        )}
      </div>
      <Badge variant={statusVariant[task.status] as 'todo'}>
        {t(`tasks.status.${task.status}`)}
      </Badge>
    </button>
  );
}

interface RelatedTasksListProps {
  attemptId: string;
  projectId: string;
  currentTaskId: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function RelatedTasksList({
  attemptId,
  projectId,
  currentTaskId,
  collapsed,
  onToggle,
}: RelatedTasksListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: relationships } = useTaskRelationships(attemptId);

  if (!relationships) return null;

  const parentTask = relationships.parent_task;
  const children = Array.isArray(relationships.children) ? relationships.children : [];

  if (!parentTask && children.length === 0) return null;

  const handleTaskPress = (taskId: string) => {
    navigate(
      `/tasks/${taskId}?project_id=${encodeURIComponent(projectId)}`,
    );
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-4 py-2 w-full text-left text-sm font-medium active:bg-muted/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
        <FolderTree className="h-4 w-4 text-muted-foreground" />
        {t('tasks.relatedTasks')}
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          {parentTask && parentTask.id !== currentTaskId && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">
                {t('tasks.parentTask')}
              </p>
              <RelatedTaskCard
                task={parentTask}
                onPress={() => handleTaskPress(parentTask.id)}
              />
            </div>
          )}

          {children.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {t('tasks.childTasks')} ({children.length})
              </p>
              <div className="space-y-1">
                {children
                  .filter((child) => child.id !== currentTaskId)
                  .map((child) => (
                    <RelatedTaskCard
                      key={child.id}
                      task={child}
                      onPress={() => handleTaskPress(child.id)}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
