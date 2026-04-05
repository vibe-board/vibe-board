import { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BaseCodingAgent } from '@shared/types';
import { useTaskAttempt } from '@/api/hooks/useAttempts';
import { useSessions } from '@/api/hooks/useSessions';
import { useAttemptStream } from '@/api/hooks/useAttemptStream';
import { useConversationEntries } from '@/api/hooks/useConversationEntries';
import { useStopExecutionProcess } from '@/api/hooks/useExecutionProcesses';
import { useTaskRelationships } from '@/api/hooks/useAttempts';
import { getLatestProfileFromProcesses } from '@/api/executorUtils';
import { NormalizedConversation } from '@/components/tasks/NormalizedConversation';
import { FollowUpInput } from '@/components/tasks/FollowUpInput';
import { useTodos } from '@/lib/useTodos';
import { ApprovalBanner } from '@/components/tasks/ApprovalBanner';
import {
  BottomSheet,
  BottomSheetBody,
} from '@/components/ui/BottomSheet';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ArrowLeft,
  MoreVertical,
  Square,
  GitCompare,
  Terminal,
  GitBranch,
  GitCommit,
  CircleCheck,
  CircleDot,
  Circle,
  FolderTree,
  ArrowUpRight,
} from 'lucide-react';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function getStatusIcon(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'completed')
    return <CircleCheck className="h-3.5 w-3.5 text-green-500" />;
  if (s === 'in_progress' || s === 'in-progress')
    return <CircleDot className="h-3.5 w-3.5 text-blue-500" />;
  if (s === 'cancelled')
    return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
}

export default function AttemptView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taskId, attemptId } = useParams<{
    taskId: string;
    attemptId: string;
  }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    null,
  );
  const [showMenu, setShowMenu] = useState(false);

  const { data: attempt, isLoading: attemptLoading } = useTaskAttempt(
    attemptId ?? '',
  );
  const { data: sessions } = useSessions(attemptId ?? '');
  const sessionId = sessions?.[0]?.id;
  const { executionProcesses, isInitialized: streamInitialized } =
    useAttemptStream(sessionId);
  const stopProcess = useStopExecutionProcess();

  // Get sorted list of processes
  const processList = useMemo(() => {
    if (!executionProcesses) return [];
    return Object.values(executionProcesses).sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
  }, [executionProcesses]);

  const processIds = useMemo(
    () => new Set(processList.map((p) => p.id)),
    [processList],
  );

  // Auto-select the first running process, or the most recent
  const activeProcessId = useMemo(() => {
    if (selectedProcessId) return selectedProcessId;
    const running = processList.find((p) => p.status === 'running');
    return running?.id ?? processList[processList.length - 1]?.id ?? null;
  }, [selectedProcessId, processList]);

  const {
    entries,
    isLoading: entriesLoading,
    hasMore,
    isLoadingMore,
    loadMore,
  } = useConversationEntries(activeProcessId ?? undefined);

  const { todos } = useTodos(entries ?? []);
  const { data: relationships } = useTaskRelationships(attemptId ?? '');
  const parentTask = relationships?.parent_task;
  const childTasks = Array.isArray(relationships?.children)
    ? relationships.children
    : [];

  const isLoading = attemptLoading;

  if (!taskId || !attemptId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.error')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.error')}
      </div>
    );
  }

  const isRunning = activeProcessId
    ? processList.find((p) => p.id === activeProcessId)?.status === 'running'
    : false;

  const handleBack = () => {
    navigate(
      `/tasks/${taskId}?project_id=${encodeURIComponent(projectId ?? '')}`,
    );
  };

  const handleStopProcess = () => {
    if (activeProcessId) {
      stopProcess.mutate(activeProcessId);
      setShowMenu(false);
    }
  };

  const handleViewDiff = () => {
    setShowMenu(false);
    navigate(
      `/tasks/${taskId}/attempts/${attemptId}/diff?project_id=${encodeURIComponent(projectId ?? '')}`,
    );
  };

  const handleViewTerminal = () => {
    setShowMenu(false);
    if (activeProcessId) {
      navigate(`/process/${activeProcessId}/terminal`);
    }
  };

  const handleViewGitActions = () => {
    setShowMenu(false);
    navigate(
      `/tasks/${taskId}/attempts/${attemptId}/git-actions?project_id=${encodeURIComponent(projectId ?? '')}`,
    );
  };

  const handleViewCommits = () => {
    setShowMenu(false);
    navigate(
      `/tasks/${taskId}/attempts/${attemptId}/commits?project_id=${encodeURIComponent(projectId ?? '')}`,
    );
  };

  const handleTaskPress = (tid: string) => {
    setShowMenu(false);
    navigate(`/tasks/${tid}?project_id=${encodeURIComponent(projectId ?? '')}`);
  };

  const statusVariant: Record<string, string> = {
    todo: 'todo',
    inprogress: 'inprogress',
    inreview: 'inreview',
    done: 'done',
    cancelled: 'cancelled',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={handleBack}
          className="p-1 -ml-1 active:bg-muted rounded-md transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">
            {attempt.branch ?? t('tasks.attempt')}
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {formatDate(attempt.created_at)}
          </p>
        </div>
        {attempt.archived && (
          <Badge variant="cancelled">{t('tasks.archived')}</Badge>
        )}
        <button
          onClick={() => setShowMenu(true)}
          className="p-1 active:bg-muted rounded-md transition-colors"
          aria-label={t('common.more', 'More')}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/* Approval banner */}
      <ApprovalBanner processIds={processIds} />

      {/* Conversation — fills all available space */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!streamInitialized ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !activeProcessId ? (
          <EmptyState
            title={t('tasks.noAttempts')}
            description={t('tasks.noAttemptsHint')}
          />
        ) : (
          <NormalizedConversation
            entries={entries ?? []}
            isLoading={entriesLoading}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
          />
        )}
      </div>

      {/* Follow-up input */}
      {sessionId && (
        <FollowUpInput
          sessionId={sessionId}
          executorProfileId={
            getLatestProfileFromProcesses(processList) ?? {
              executor: (sessions?.[0]?.executor ?? 'CLAUDE_CODE') as BaseCodingAgent,
              variant: null,
            }
          }
        />
      )}

      {/* Menu BottomSheet */}
      <BottomSheet
        open={showMenu}
        onClose={() => setShowMenu(false)}
        title={t('common.more', 'More')}
      >
        <BottomSheetBody className="space-y-1">
          {/* Processes */}
          {processList.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground px-1 pt-2 pb-1">
                {t('tasks.processes', 'Processes')} ({processList.length})
              </p>
              {processList.map((process) => {
                const actionLabel =
                  typeof process.executor_action.typ === 'object' &&
                  'type' in process.executor_action.typ
                    ? process.executor_action.typ.type
                    : String(process.run_reason);
                const statusColor: Record<string, string> = {
                  running: 'bg-green-500',
                  completed: 'bg-muted-foreground',
                  failed: 'bg-destructive',
                  killed: 'bg-yellow-500',
                };
                return (
                  <button
                    key={process.id}
                    onClick={() => {
                      setSelectedProcessId(process.id);
                      setShowMenu(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 w-full text-left text-sm rounded-md transition-colors ${
                      process.id === activeProcessId
                        ? 'bg-accent'
                        : 'active:bg-muted/50'
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${statusColor[process.status] ?? 'bg-muted'}`}
                    />
                    <span className="flex-1 truncate">{actionLabel}</span>
                    <Badge
                      variant={
                        process.status === 'running' ? 'inprogress' : 'todo'
                      }
                    >
                      {process.status}
                    </Badge>
                  </button>
                );
              })}
            </>
          )}

          {/* Todos */}
          {todos.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground px-1 pt-3 pb-1">
                {t('tasks.todos')} ({todos.length})
              </p>
              <ul className="space-y-1">
                {todos.map((todo, index) => (
                  <li
                    key={`${todo.content}-${index}`}
                    className="flex items-start gap-2 px-3 py-1"
                  >
                    <span className="mt-0.5 shrink-0">
                      {getStatusIcon(todo.status)}
                    </span>
                    <span
                      className={`text-sm leading-5 ${
                        todo.status?.toLowerCase() === 'cancelled'
                          ? 'line-through text-muted-foreground/50'
                          : ''
                      }`}
                    >
                      {todo.content}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Related tasks */}
          {projectId && (parentTask || childTasks.length > 0) && (
            <>
              <p className="text-xs font-medium text-muted-foreground px-1 pt-3 pb-1 flex items-center gap-1">
                <FolderTree className="h-3.5 w-3.5" />
                {t('tasks.relatedTasks')}
              </p>
              {parentTask && parentTask.id !== taskId && (
                <button
                  onClick={() => handleTaskPress(parentTask.id)}
                  className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm rounded-md active:bg-muted/50 transition-colors"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{parentTask.title}</span>
                  <Badge
                    variant={
                      statusVariant[parentTask.status] as 'todo'
                    }
                  >
                    {t(`tasks.status.${parentTask.status}`)}
                  </Badge>
                </button>
              )}
              {childTasks
                .filter((child) => child.id !== taskId)
                .map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleTaskPress(child.id)}
                    className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm rounded-md active:bg-muted/50 transition-colors"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{child.title}</span>
                    <Badge
                      variant={statusVariant[child.status] as 'todo'}
                    >
                      {t(`tasks.status.${child.status}`)}
                    </Badge>
                  </button>
                ))}
            </>
          )}

          {/* Actions */}
          <p className="text-xs font-medium text-muted-foreground px-1 pt-3 pb-1">
            {t('common.actions', 'Actions')}
          </p>
          {isRunning && (
            <button
              onClick={handleStopProcess}
              className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left text-sm rounded-md active:bg-muted/50 transition-colors text-destructive"
            >
              <Square className="h-4 w-4" />
              {t('tasks.stopAttempt')}
            </button>
          )}
          <button
            onClick={handleViewDiff}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left text-sm rounded-md active:bg-muted/50 transition-colors"
          >
            <GitCompare className="h-4 w-4" />
            {t('tasks.viewDiff')}
          </button>
          <button
            onClick={handleViewCommits}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left text-sm rounded-md active:bg-muted/50 transition-colors"
          >
            <GitCommit className="h-4 w-4" />
            {t('git.commits', 'Commits')}
          </button>
          <button
            onClick={handleViewTerminal}
            disabled={!activeProcessId}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left text-sm rounded-md active:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <Terminal className="h-4 w-4" />
            {t('terminal.title')}
          </button>
          <button
            onClick={handleViewGitActions}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left text-sm rounded-md active:bg-muted/50 transition-colors"
          >
            <GitBranch className="h-4 w-4" />
            {t('git.actions')}
          </button>
        </BottomSheetBody>
      </BottomSheet>
    </div>
  );
}
