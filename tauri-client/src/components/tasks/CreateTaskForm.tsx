import { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import { useCreateTask, useUpdateTask, useCreateAndStartTask } from '@/api/hooks/useTasks';
import { useSystemInfo } from '@/api/hooks/useConfig';
import { useProjectRepos } from '@/api/hooks/useProjects';
import { useSlashCommands } from '@/api/hooks/useSlashCommands';
import { repoKeys } from '@/api/hooks/useRepos';
import { apiClient } from '@/api/client';
import type { Task, BaseCodingAgent } from '@shared/types';
import {
  BottomSheet,
  BottomSheetBody,
} from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { AGENT_LABELS, filterEnabledAgents } from '@/utils/executor';

interface BranchInfo {
  name: string;
  is_default: boolean;
}

interface CreateTaskFormProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  editTask?: Task;
}

export function CreateTaskForm({
  projectId,
  open,
  onClose,
  editTask,
}: CreateTaskFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(editTask?.title ?? '');
  const [description, setDescription] = useState(editTask?.description ?? '');
  const [autoStart, setAutoStart] = useState(true);
  const [selectedExecutor, setSelectedExecutor] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [repoBranches, setRepoBranches] = useState<Record<string, string>>({});
  const [workspaceMode, setWorkspaceMode] = useState<'worktree' | 'direct'>('worktree');

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const createAndStart = useCreateAndStartTask();
  const { data: info } = useSystemInfo();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = !!editTask;
  const isPending =
    createTask.isPending || updateTask.isPending || createAndStart.isPending;

  const { data: projectRepos = [] } = useProjectRepos(projectId, {
    enabled: open && autoStart && !isEditing,
  });

  // Fetch branches for each project repo using useQueries
  const branchQueries = useQueries({
    queries: projectRepos.map((repo) => ({
      queryKey: repoKeys.branches(repo.id),
      queryFn: () =>
        apiClient.get<BranchInfo[]>(`/repos/${repo.id}/branches`),
      enabled: open && autoStart && !isEditing,
    })),
  });

  // Build a map of repo_id -> branches from queries
  const branchesByRepo = useMemo(() => {
    const map: Record<string, BranchInfo[]> = {};
    projectRepos.forEach((repo, i) => {
      if (branchQueries[i]?.data) {
        map[repo.id] = branchQueries[i].data!;
      }
    });
    return map;
  }, [projectRepos, branchQueries]);

  // Initialize repo branch selections with defaults
  useEffect(() => {
    if (projectRepos.length === 0) return;
    setRepoBranches((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const repo of projectRepos) {
        if (next[repo.id]) continue;
        const branches = branchesByRepo[repo.id];
        if (!branches) continue;
        const defaultBranch =
          branches.find((b) => b.is_default) ??
          branches[0];
        if (defaultBranch) {
          next[repo.id] = defaultBranch.name;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projectRepos, branchesByRepo]);

  const availableExecutors = useMemo(() => {
    if (!info?.executors) return [];
    const allAgents = Object.keys(info.executors) as BaseCodingAgent[];
    return filterEnabledAgents(allAgents, info?.config?.agent_enabled);
  }, [info]);

  const effectiveExecutor =
    selectedExecutor || availableExecutors[0] || '';

  const { commands: slashCommands } = useSlashCommands(
    effectiveExecutor as BaseCodingAgent | undefined,
  );

  const filteredCommands = useMemo(() => {
    if (!description.startsWith('/')) return [];
    const query = description.slice(1).toLowerCase();
    return slashCommands.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(query),
    );
  }, [description, slashCommands]);

  const handleSelectCommand = (name: string) => {
    setDescription(`/${name} `);
    descriptionRef.current?.focus();
  };

  // Variant options for the selected executor
  const variantOptions = useMemo(() => {
    if (!info?.executors || !effectiveExecutor) return [];
    const executorConfig = info.executors[effectiveExecutor as BaseCodingAgent];
    if (!executorConfig) return [];
    return Object.keys(executorConfig).map((key) => ({
      value: key,
      label: key,
    }));
  }, [info, effectiveExecutor]);

  // Workspace mode options
  const workspaceModeOptions = [
    { value: 'worktree', label: t('tasks.worktree') },
    { value: 'direct', label: t('tasks.direct') },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isPending) return;

    if (isEditing) {
      updateTask.mutate(
        {
          id: editTask.id,
          body: {
            title: trimmedTitle,
            description: description.trim() || null,
            status: null,
            parent_workspace_id: null,
            image_ids: null,
          },
        },
        {
          onSuccess: () => {
            setTitle('');
            setDescription('');
            onClose();
          },
        },
      );
    } else if (autoStart && effectiveExecutor) {
      const repos = projectRepos.map((repo) => ({
        repo_id: repo.id,
        target_branch: repoBranches[repo.id] ?? 'main',
      }));
      createAndStart.mutate(
        {
          task: {
            project_id: projectId,
            title: trimmedTitle,
            description: description.trim() || null,
            status: null,
            parent_workspace_id: null,
            image_ids: null,
          },
          executor_profile_id: {
            executor: effectiveExecutor as BaseCodingAgent,
            variant: selectedVariant,
          },
          repos,
          workspace_mode: workspaceMode,
        },
        {
          onSuccess: () => {
            setTitle('');
            setDescription('');
            onClose();
          },
        },
      );
    } else {
      createTask.mutate(
        {
          project_id: projectId,
          title: trimmedTitle,
          description: description.trim() || null,
          status: null,
          parent_workspace_id: null,
          image_ids: null,
        },
        {
          onSuccess: () => {
            setTitle('');
            setDescription('');
            onClose();
          },
        },
      );
    }
  };

  const handleClose = () => {
    if (!isPending) {
      setTitle(editTask?.title ?? '');
      setDescription(editTask?.description ?? '');
      onClose();
    }
  };

  const executorOptions = availableExecutors.map((key) => ({
    value: key,
    label: AGENT_LABELS[key] ?? key.replace(/_/g, ' '),
  }));

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={isEditing ? t('tasks.edit') : t('tasks.create')}
    >
      <form onSubmit={handleSubmit}>
        <BottomSheetBody className="space-y-4">
          <Input
            label={t('tasks.titleLabel')}
            placeholder={t('tasks.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              {t('tasks.descriptionLabel')}
            </label>
            {filteredCommands.length > 0 && (
              <div className="rounded-md border border-input bg-background">
                {filteredCommands.map((cmd) => (
                  <button
                    key={cmd.name}
                    type="button"
                    onClick={() => handleSelectCommand(cmd.name)}
                    className="w-full text-left px-3 py-2 active:bg-muted"
                  >
                    <span className="text-sm font-medium text-foreground">
                      /{cmd.name}
                    </span>
                    {cmd.description && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {cmd.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={descriptionRef}
              placeholder={t('tasks.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          {!isEditing && executorOptions.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground flex-1">
                  {t('settings.executorType', 'Executor')}
                </label>
                <button
                  type="button"
                  onClick={() => setAutoStart(!autoStart)}
                  className={`
                    relative w-9 h-5 rounded-full transition-colors shrink-0
                    ${autoStart ? 'bg-primary' : 'bg-muted'}
                  `}
                >
                  <span
                    className={`
                      absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform
                      ${autoStart ? 'left-[18px]' : 'left-0.5'}
                    `}
                  />
                </button>
              </div>
              {autoStart && (
                <>
                  <Select
                    value={effectiveExecutor}
                    onChange={setSelectedExecutor}
                    options={executorOptions}
                  />
                  {variantOptions.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        {t('tasks.configuration', 'Configuration')}
                      </label>
                      <Select
                        value={selectedVariant ?? ''}
                        onChange={(v) => setSelectedVariant(v || null)}
                        placeholder={t('tasks.variantDefault')}
                        options={[
                          { value: '', label: t('tasks.variantDefault') },
                          ...variantOptions,
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
                          value={repoBranches[repo.id] ?? ''}
                          onChange={(v) =>
                            setRepoBranches((prev) => ({
                              ...prev,
                              [repo.id]: v,
                            }))
                          }
                          options={branchOptions}
                        />
                      </div>
                    );
                  })}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      {t('tasks.workspaceMode')}
                    </label>
                    <Select
                      value={workspaceMode}
                      onChange={(v) =>
                        setWorkspaceMode(v as 'worktree' | 'direct')
                      }
                      options={workspaceModeOptions}
                    />
                  </div>
                </>
              )}
            </>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || isPending}
              className="flex-1"
            >
              {isPending
                ? t('common.loading')
                : isEditing
                  ? t('common.save')
                  : t('common.create')}
            </Button>
          </div>
        </BottomSheetBody>
      </form>
    </BottomSheet>
  );
}
