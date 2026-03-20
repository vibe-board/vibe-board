import { useTranslation } from 'react-i18next';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { GitCommit, Undo2, FileDiff } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCommitHistory } from '@/hooks/useCommitHistory';
import type { CommitInfo, Workspace } from 'shared/types';
import { RevertCommitDialog } from '@/components/dialogs/tasks/RevertCommitDialog';
import { useQueryClient } from '@tanstack/react-query';

interface CommitHistoryPanelProps {
  selectedAttempt: Workspace | null;
  repoId: string | null;
  onViewDiff?: (sha: string) => void;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return 'just now';
}

function formatSha(sha: string): string {
  return sha.substring(0, 7);
}

interface CommitItemProps {
  commit: CommitInfo;
  attemptId: string;
  repoId: string;
  onViewDiff?: (sha: string) => void;
}

function CommitItem({
  commit,
  attemptId,
  repoId,
  onViewDiff,
}: CommitItemProps) {
  const { t } = useTranslation('tasks');
  const queryClient = useQueryClient();

  const handleViewDiff = () => {
    onViewDiff?.(commit.sha);
  };

  const handleRevert = async () => {
    const result = await RevertCommitDialog.show({
      commit,
      attemptId,
      repoId,
    });

    if (result === 'confirmed') {
      queryClient.invalidateQueries({ queryKey: ['commitHistory'] });
    }
  };

  return (
    <div className="group flex items-start gap-3 py-3 px-3 border-b border-border/50 hover:bg-accent/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <GitCommit className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="text-xs font-mono text-muted-foreground bg-muted px-1 rounded cursor-pointer hover:text-foreground">
                  {formatSha(commit.sha)}
                </code>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="font-mono text-xs">{commit.sha}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-sm truncate">{commit.message}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{commit.author}</span>
          <span>&middot;</span>
          <span>{formatRelativeTime(commit.timestamp)}</span>
          <span>&middot;</span>
          <span className="text-green-600 dark:text-green-500">
            +{commit.additions}
          </span>
          <span className="text-red-600 dark:text-red-500">
            -{commit.deletions}
          </span>
          <span>
            ({commit.files_changed}{' '}
            {commit.files_changed === 1 ? 'file' : 'files'})
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleViewDiff}
              >
                <FileDiff className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('commit.viewDiff')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleRevert}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('commit.revert')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export function CommitHistoryPanel({
  selectedAttempt,
  repoId,
  onViewDiff,
}: CommitHistoryPanelProps) {
  const { t } = useTranslation('tasks');
  const {
    data: commits,
    isLoading,
    error,
  } = useCommitHistory(selectedAttempt?.id ?? null, repoId);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="text-red-800 text-sm">
          {t('commit.errorLoadingHistory', { error: String(error) })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {commits && commits.length > 0 && (
        <div className="sticky top-0 z-10 bg-background border-b px-3 py-2">
          <div className="flex items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('commit.count', { count: commits.length })}
            </span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : !commits || commits.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t('commit.noCommits')}
          </div>
        ) : (
          <div>
            {commits.map((commit) => (
              <CommitItem
                key={commit.sha}
                commit={commit}
                attemptId={selectedAttempt!.id}
                repoId={repoId!}
                onViewDiff={onViewDiff}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
