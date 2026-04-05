import { useTranslation } from 'react-i18next';
import type { Task, TaskStatus } from '@shared/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface TaskCardProps {
  task: Task;
  onPress: (taskId: string) => void;
}

const STATUS_VARIANT: Record<TaskStatus, string> = {
  todo: 'todo',
  inprogress: 'inprogress',
  inreview: 'inreview',
  done: 'done',
  cancelled: 'cancelled',
};

export function TaskCard({ task, onPress }: TaskCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      className="active:scale-[0.98] transition-transform cursor-pointer"
      onClick={() => onPress(task.id)}
    >
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base truncate">{task.title}</CardTitle>
          {task.executor && (
            <CardDescription className="text-xs">
              {task.executor}
              {task.variant ? ` / ${task.variant}` : ''}
            </CardDescription>
          )}
        </div>
        <Badge variant={STATUS_VARIANT[task.status] as BadgeProps['variant']}>
          {t(`tasks.status.${task.status}`)}
        </Badge>
      </CardHeader>

      {/* Attempt indicators */}
      {(task.has_in_progress_attempt || task.last_attempt_failed) && (
        <div className="px-4 pb-3 flex gap-2">
          {task.has_in_progress_attempt && (
            <span className="text-xs text-blue-600 font-medium">
              {t('tasks.status.in_progress')}
            </span>
          )}
          {task.last_attempt_failed && !task.has_in_progress_attempt && (
            <span className="text-xs text-destructive font-medium">
              {t('tasks.status.failed')}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// Needed for the Badge variant type reference
type BadgeProps = React.ComponentProps<typeof Badge>;
