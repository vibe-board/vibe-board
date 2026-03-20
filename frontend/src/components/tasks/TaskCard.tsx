import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import {
  Link,
  Loader2,
  Settings2,
  SquareTerminal,
  XCircle,
} from 'lucide-react';
import type { TaskWithAttemptStatus, BaseCodingAgent } from 'shared/types';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { Button } from '@/components/ui/button';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import { attemptsApi } from '@/lib/api';
import { TaskCardHeader } from './TaskCardHeader';
import { AgentIcon, getAgentName } from '@/components/agents/AgentIcon';
import { useTranslation } from 'react-i18next';
import { useTerminal } from '@/contexts/TerminalContext';

type Task = TaskWithAttemptStatus;

interface TaskCardProps {
  task: Task;
  index: number;
  status: string;
  onViewDetails: (task: Task) => void;
  isOpen?: boolean;
  projectId: string;
}

export const TaskCard = memo(
  function TaskCard({
    task,
    index,
    status,
    onViewDetails,
    isOpen,
    projectId,
  }: TaskCardProps) {
    const { t } = useTranslation('tasks');
    const navigate = useNavigateWithSearch();
    const { hasTerminalForTask } = useTerminal();
    const [isNavigatingToParent, setIsNavigatingToParent] = useState(false);

    const handleClick = useCallback(() => {
      onViewDetails(task);
    }, [task, onViewDetails]);

    const handleParentClick = useCallback(
      async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!task.parent_workspace_id || isNavigatingToParent) return;

        setIsNavigatingToParent(true);
        try {
          const parentAttempt = await attemptsApi.get(task.parent_workspace_id);
          navigate(
            paths.attempt(
              projectId,
              parentAttempt.task_id,
              task.parent_workspace_id
            )
          );
        } catch (error) {
          console.error('Failed to navigate to parent task attempt:', error);
          setIsNavigatingToParent(false);
        }
      },
      [task.parent_workspace_id, projectId, navigate, isNavigatingToParent]
    );

    const localRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!isOpen || !localRef.current) return;
      const el = localRef.current;
      requestAnimationFrame(() => {
        el.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    }, [isOpen]);

    return (
      <KanbanCard
        key={task.id}
        id={task.id}
        name={task.title}
        index={index}
        parent={status}
        onClick={handleClick}
        isOpen={isOpen}
        forwardedRef={localRef}
      >
        <div className="flex flex-col gap-2">
          <TaskCardHeader
            title={task.title}
            right={
              <>
                {task.has_in_progress_attempt && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                )}
                {task.last_attempt_failed && (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                {task.parent_workspace_id && (
                  <Button
                    variant="icon"
                    onClick={handleParentClick}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    disabled={isNavigatingToParent}
                    title={t('navigateToParent')}
                  >
                    <Link className="h-4 w-4" />
                  </Button>
                )}
                {hasTerminalForTask(task.id) && (
                  <SquareTerminal className="h-4 w-4 text-emerald-500" />
                )}
                <ActionsDropdown task={task} />
              </>
            }
          />
          {task.description && (
            <p className="text-sm text-secondary-foreground break-words">
              {task.description.length > 130
                ? `${task.description.substring(0, 130)}...`
                : task.description}
            </p>
          )}
          {task.executor && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AgentIcon
                agent={task.executor as BaseCodingAgent}
                className="h-3.5 w-3.5"
              />
              <span>{getAgentName(task.executor as BaseCodingAgent)}</span>
              {task.variant && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <Settings2 className="h-3 w-3" />
                  <span>{task.variant}</span>
                </>
              )}
            </div>
          )}
        </div>
      </KanbanCard>
    );
  },
  (prev, next) => {
    return (
      prev.task.id === next.task.id &&
      prev.task.title === next.task.title &&
      prev.task.status === next.task.status &&
      prev.task.has_in_progress_attempt === next.task.has_in_progress_attempt &&
      prev.task.last_attempt_failed === next.task.last_attempt_failed &&
      prev.task.parent_workspace_id === next.task.parent_workspace_id &&
      prev.task.executor === next.task.executor &&
      prev.task.variant === next.task.variant &&
      prev.task.description === next.task.description &&
      prev.index === next.index &&
      prev.isOpen === next.isOpen &&
      prev.status === next.status &&
      prev.projectId === next.projectId
    );
  }
);
