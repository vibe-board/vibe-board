import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useTask, useDeleteTask, useUpdateTask } from '@/api/hooks/useTasks';
import { useTaskAttempts, useCreateTaskAttempt } from '@/api/hooks/useAttempts';
import { useSystemInfo } from '@/api/hooks/useConfig';
import { useProjectRepos } from '@/api/hooks/useProjects';
import { repoKeys } from '@/api/hooks/useRepos';
import { apiClient } from '@/api/client';
import type { BaseCodingAgent, TaskStatus } from '@shared/types';
import { AttemptList } from '@/components/tasks/AttemptList';
import { BranchInfoBar } from '@/components/git/BranchInfoBar';
import { CreateTaskForm } from '@/components/tasks/CreateTaskForm';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  BottomSheet,
  BottomSheetBody,
} from '@/components/ui/BottomSheet';
import { Select } from '@/components/ui/Select';
import { AGENT_LABELS, filterEnabledAgents } from '@/utils/executor';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';

const STATUSES: TaskStatus[] = ['todo', 'inprogress', 'inreview', 'done', 'cancelled'];

interface BranchInfo {
  name: string;
  is_default: boolean;
}

export default function TaskDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');

  const { data: task, isLoading: taskLoading } = useTask(taskId ?? '');
  const {
    data: attempts,
    isLoading: attemptsLoading,
    isError: attemptsError,
    error: attemptsErrorDetail,
    refetch: refetchAttempts,
  } = useTaskAttempts(taskId ?? '');
  const deleteTask = useDeleteTask();
  const createAttempt = useCreateTaskAttempt();
  const updateTask = useUpdateTask();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showStartSheet, setShowStartSheet] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const hasAutoNavigated = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hasAutoNavigated.current = false;
  }, [taskId]);

  // Start attempt sheet state
  const [startExecutor, setStartExecutor] = useState<string>('');
  const [startVariant, setStartVariant] = useState<string | null>(null);
  const [startRepoBranches, setStartRepoBranches] = useState<Record<string, string>>({});

  const { data: info } = useSystemInfo();
  const { data: projectRepos = [] } = useProjectRepos(projectId ?? '', {
    enabled: showStartSheet,
  });

  // Fetch branches for each project repo
  const branchQueries = useQueries({
    queries: projectRepos.map((repo) => ({
      queryKey: repoKeys.branches(repo.id),
      queryFn: () =>
        apiClient.get<BranchInfo[]>(`/repos/${repo.id}/branches`),
      enabled: showStartSheet,
    })),
  });

  const branchesByRepo = useMemo(() => {
    const map: Record<string, BranchInfo[]> = {};
    projectRepos.forEach((repo, i) => {
      if (branchQueries[i]?.data) {
        map[repo.id] = branchQueries[i].data!;
      }
    });
    return map;
  }, [projectRepos, branchQueries]);

  // Initialize defaults when sheet opens
  useEffect(() => {
    if (!showStartSheet || !info?.executors) return;
    // Default executor: first available
    const executors = Object.keys(info.executors);
    const defaultExecutor = executors[0] ?? '';
    setStartExecutor(defaultExecutor);

    // Default variant: null
    setStartVariant(null);

    // Default branches
    setStartRepoBranches((prev) => {
      const next = { ...prev };
      for (const repo of projectRepos) {
        if (next[repo.id]) continue;
        const branches = branchesByRepo[repo.id];
        const defaultBranch =
          branches?.find((b) => b.is_default) ?? branches?.[0];
        if (defaultBranch) {
          next[repo.id] = defaultBranch.name;
        }
      }
      return next;
    });
  }, [showStartSheet, info, projectRepos, branchesByRepo]);

  const availableExecutors = useMemo(() => {
    if (!info?.executors) return [];
    const allAgents = Object.keys(info.executors) as BaseCodingAgent[];
    return filterEnabledAgents(allAgents, info?.config?.agent_enabled);
  }, [info]);

  const effectiveStartExecutor = startExecutor || availableExecutors[0] || '';

  const startVariantOptions = useMemo(() => {
    if (!info?.executors || !effectiveStartExecutor) return [];
    const executorConfig = info.executors[effectiveStartExecutor as BaseCodingAgent];
    if (!executorConfig) return [];
    return Object.keys(executorConfig).map((key) => ({
      value: key,
      label: key,
    }));
  }, [info, effectiveStartExecutor]);

  const isLoading = taskLoading || attemptsLoading;

  // Auto-navigate to the latest attempt (like web UI's "latest" behavior)
  useEffect(() => {
    if (hasAutoNavigated.current) return;
    if (attemptsLoading || !attempts || attempts.length === 0) return;

    hasAutoNavigated.current = true;
    const latest = [...attempts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    navigate(
      `/tasks/${taskId}/attempts/${latest.id}?project_id=${encodeURIComponent(projectId ?? '')}`,
      { replace: true },
    );
  }, [attempts, attemptsLoading, taskId, projectId, navigate]);

  if (!taskId) {
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

  if (!task) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.error')}
      </div>
    );
  }

  const handleBack = () => {
    if (projectId) {
      navigate(`/tasks?project_id=${encodeURIComponent(projectId)}`);
    } else {
      navigate(-1);
    }
  };

  const handleDelete = () => {
    deleteTask.mutate(taskId, {
      onSuccess: () => navigate(-1),
    });
  };

  const handleOpenStartSheet = () => {
    setShowStartSheet(true);
  };

  const handleConfirmStartAttempt = () => {
    if (!projectId || !effectiveStartExecutor) return;
    const repos = projectRepos.map((repo) => ({
      repo_id: repo.id,
      target_branch: startRepoBranches[repo.id] ?? 'main',
    }));
    createAttempt.mutate(
      {
        task_id: taskId,
        executor_profile_id: {
          executor: effectiveStartExecutor as BaseCodingAgent,
          variant: startVariant,
        },
        repos,
      },
      {
        onSuccess: () => setShowStartSheet(false),
      },
    );
  };

  const handleStatusChange = (newStatus: string) => {
    if (!task) return;
    updateTask.mutate(
      {
        id: task.id,
        body: {
          title: task.title,
          description: task.description,
          status: newStatus as TaskStatus,
          parent_workspace_id: null,
          image_ids: null,
        },
      },
      {
        onSuccess: () => setShowStatusSheet(false),
      },
    );
  };

  const handleAttemptSelect = (attemptId: string) => {
    navigate(
      `/tasks/${taskId}/attempts/${attemptId}?project_id=${encodeURIComponent(projectId ?? '')}`,
    );
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
          <h1 className="text-lg font-semibold truncate">{task.title}</h1>
        </div>
        <Badge
          variant={statusVariant[task.status] as 'todo'}
          onClick={() => setShowStatusSheet(true)}
          className="cursor-pointer"
        >
          {t(`tasks.status.${task.status}`)}
        </Badge>
      </div>

      {/* Description */}
      {task.description && (
        <div className="px-4 py-3 border-b border-border">
          <div className="text-sm text-muted-foreground prose-sm max-w-none">
            <ReactMarkdown>{task.description}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Branch info — shown if latest attempt has branch info */}
      {attempts && attempts.length > 0 && (
        <BranchInfoBar branch={attempts[0].branch} />
      )}

      {/* Actions */}
      <div className="flex gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button
          size="sm"
          onClick={handleOpenStartSheet}
          disabled={!projectId}
          className="flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t('tasks.startAttempt')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
          {t('tasks.delete')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowEditForm(true)}
          className="flex items-center gap-1.5"
        >
          <Pencil className="h-4 w-4" />
          {t('common.edit')}
        </Button>
      </div>

      {/* Attempts section */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3">
        <h2 className="text-sm font-semibold mb-3">
          {t('tasks.attempts')} ({attempts?.length ?? 0})
        </h2>
        {attemptsError && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-4">
            <p className="text-sm text-destructive">
              {attemptsErrorDetail instanceof Error
                ? attemptsErrorDetail.message
                : t('common.error')}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetchAttempts()}>
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        )}
        <AttemptList
          attempts={attempts ?? []}
          onSelect={handleAttemptSelect}
          scrollRootRef={scrollRef}
        />
      </div>

      {/* Edit task form */}
      <CreateTaskForm
        projectId={projectId ?? ''}
        open={showEditForm}
        onClose={() => setShowEditForm(false)}
        editTask={task}
      />

      {/* Start Attempt BottomSheet */}
      <BottomSheet
        open={showStartSheet}
        onClose={() => setShowStartSheet(false)}
        title={t('tasks.selectExecutor')}
      >
        <BottomSheetBody className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {t('settings.executor')}
            </label>
            <Select
              value={effectiveStartExecutor}
              onChange={setStartExecutor}
              options={availableExecutors.map((key) => ({
                value: key,
                label: AGENT_LABELS[key] ?? key.replace(/_/g, ' '),
              }))}
            />
          </div>
          {startVariantOptions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {t('tasks.variantLabel')}
              </label>
              <Select
                value={startVariant ?? ''}
                onChange={(v) => setStartVariant(v || null)}
                placeholder={t('tasks.variantDefault')}
                options={[
                  { value: '', label: t('tasks.variantDefault') },
                  ...startVariantOptions,
                ]}
              />
            </div>
          )}
          {projectRepos.map((repo) => {
            const branches = branchesByRepo[repo.id] ?? [];
            const branchOptions = branches.map((b) => ({
              value: b.name,
              label: b.name,
            }));
            if (branchOptions.length === 0) return null;
            return (
              <div key={repo.id} className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {repo.name ?? repo.id} — {t('tasks.branchLabel')}
                </label>
                <Select
                  value={startRepoBranches[repo.id] ?? ''}
                  onChange={(v) =>
                    setStartRepoBranches((prev) => ({
                      ...prev,
                      [repo.id]: v,
                    }))
                  }
                  options={branchOptions}
                />
              </div>
            );
          })}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowStartSheet(false)}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleConfirmStartAttempt}
              disabled={!effectiveStartExecutor || createAttempt.isPending}
              className="flex-1"
            >
              {createAttempt.isPending
                ? t('common.loading')
                : t('tasks.startAttempt')}
            </Button>
          </div>
        </BottomSheetBody>
      </BottomSheet>

      {/* Status Change BottomSheet */}
      <BottomSheet
        open={showStatusSheet}
        onClose={() => setShowStatusSheet(false)}
        title={t('tasks.selectStatus')}
      >
        <BottomSheetBody className="space-y-2">
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={updateTask.isPending}
              className={`
                w-full text-left px-4 py-3 rounded-lg transition-colors
                ${
                  task.status === status
                    ? 'bg-primary text-primary-foreground'
                    : 'active:bg-muted'
                }
              `}
            >
              {t(`tasks.status.${status}`)}
            </button>
          ))}
        </BottomSheetBody>
      </BottomSheet>
    </div>
  );
}
