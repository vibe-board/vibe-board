import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '@/contexts/ProjectContext';
import { useProjectRepos } from '@/hooks';
import { useHomeDir } from '@/hooks/useHomeDir';
import { useTaskAttemptWithSession } from '@/hooks/useTaskAttempt';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import {
  TerminalPanel,
  type NewTabOption,
} from '@/components/panels/TerminalPanel';

export function TerminalBottomDrawer() {
  const { taskId, attemptId } = useParams<{
    projectId?: string;
    taskId?: string;
    attemptId?: string;
  }>();
  const { projectId } = useProject();
  const { data: repos } = useProjectRepos(projectId);
  const { data: homeDirData } = useHomeDir();

  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const { data: attempt } = useTaskAttemptWithSession(effectiveAttemptId);
  const { repos: attemptRepos } = useAttemptRepo(attempt?.id);

  const terminalCwd = useMemo(() => {
    const containerRef = attempt?.container_ref;
    if (!containerRef) return null;
    const repo = attemptRepos[0];
    return attempt.mode === 'worktree' && repo
      ? `${containerRef}/${repo.name}`
      : containerRef;
  }, [attempt?.container_ref, attempt?.mode, attemptRepos]);

  const newTabOptions = useMemo((): NewTabOption[] => {
    const options: NewTabOption[] = [];

    // Task terminal option
    const hasActiveWorkspace = !!(attempt?.id && taskId && terminalCwd);
    options.push({
      label: 'Task Terminal',
      context: {
        type: 'task',
        attemptId: attempt?.id ?? '',
        taskId: taskId ?? '',
      },
      workspaceId: attempt?.id ?? '',
      taskId: taskId ?? '',
      cwd: terminalCwd ?? '',
      disabled: !hasActiveWorkspace,
    });

    // Project terminal option
    const repoPath = repos?.[0]?.path ? String(repos[0].path) : null;
    options.push({
      label: 'Project Terminal',
      context: { type: 'project', projectId: projectId ?? '' },
      workspaceId: projectId ? `project-terminal:${projectId}` : '',
      taskId: projectId ? `project-terminal:${projectId}` : '',
      cwd: repoPath ?? '',
      disabled: !projectId || !repoPath,
    });

    // Home directory option
    options.push({
      label: 'Home Directory',
      context: { type: 'home' },
      workspaceId: 'global-terminal',
      taskId: 'global-terminal',
      cwd: homeDirData?.home_dir ?? '',
      disabled: !homeDirData?.home_dir,
    });

    return options;
  }, [attempt?.id, taskId, terminalCwd, projectId, repos, homeDirData]);

  return <TerminalPanel newTabOptions={newTabOptions} />;
}
