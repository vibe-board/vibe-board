import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import {
  useAttemptCommits,
  useCommitDiff,
} from '@/api/hooks/useAttempts';
import { useAttemptRepos } from '@/api/hooks/useAttemptRepos';
import { DiffViewer } from '@/components/git/DiffViewer';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ArrowLeft, Plus, Minus, GitCommitHorizontal } from 'lucide-react';

function formatRelativeTime(timestamp: Date | string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function CommitHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taskId, attemptId } = useParams<{
    taskId: string;
    attemptId: string;
  }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  const { data: repos } = useAttemptRepos(attemptId ?? '');
  const repoId = repos?.[0]?.id ?? '';

  const { data: commitsResponse, isLoading: commitsLoading } = useAttemptCommits(
    attemptId ?? '',
    repoId || undefined,
  );
  const commits = commitsResponse?.commits;

  const { data: commitDiffs, isLoading: diffLoading } = useCommitDiff(
    attemptId ?? '',
    selectedSha ?? '',
    repoId,
  );

  const backUrl = `/tasks/${taskId}/attempts/${attemptId}?project_id=${encodeURIComponent(projectId ?? '')}`;

  const handleBack = () => {
    if (selectedSha) {
      setSelectedSha(null);
    } else {
      navigate(backUrl);
    }
  };

  if (!taskId || !attemptId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.error')}
      </div>
    );
  }

  if (selectedSha) {
    return (
      <div className="flex flex-col h-full">
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
              {t('git.commits')}
            </h1>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {selectedSha.slice(0, 8)}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {diffLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <DiffViewer diffs={commitDiffs ?? []} />
          )}
        </div>

        <div className="flex gap-2 px-4 py-2 border-t border-border shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBack}
            className="flex items-center gap-1.5"
          >
            {t('common.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={handleBack}
          className="p-1 -ml-1 active:bg-muted rounded-md transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">{t('git.commits')}</h1>
      </div>

      <div className="flex-1">
        {commitsLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !commits || commits.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('git.noCommits')}
          </div>
        ) : (
          <Virtuoso
            className="flex-1"
            data={commits}
            itemContent={(_index, commit) => (
              <button
                onClick={() => setSelectedSha(commit.sha)}
                className="w-full text-left px-4 py-3 border-b border-border active:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <GitCommitHorizontal className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {commit.message.split('\n')[0]}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono shrink-0">
                        {commit.sha.slice(0, 7)}
                      </span>
                      <span className="truncate">{commit.author}</span>
                      <span className="shrink-0">
                        {formatRelativeTime(commit.timestamp)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <span className="flex items-center gap-0.5 text-green-600">
                      <Plus className="h-3 w-3" />
                      {commit.additions}
                    </span>
                    <span className="flex items-center gap-0.5 text-red-600">
                      <Minus className="h-3 w-3" />
                      {commit.deletions}
                    </span>
                  </div>
                </div>
              </button>
            )}
          />
        )}
      </div>

      <div className="flex gap-2 px-4 py-2 border-t border-border shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={handleBack}
          className="flex items-center gap-1.5"
        >
          {t('common.back')}
        </Button>
      </div>
    </div>
  );
}
