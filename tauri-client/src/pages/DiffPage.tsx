import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAttemptDiff } from '@/api/hooks/useAttempts';
import { useAttemptRepos } from '@/api/hooks/useAttemptRepos';
import { DiffViewer } from '@/components/git/DiffViewer';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ArrowLeft } from 'lucide-react';

export default function DiffPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taskId, attemptId } = useParams<{
    taskId: string;
    attemptId: string;
  }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');

  const { data: repos, isLoading: reposLoading } = useAttemptRepos(
    attemptId ?? '',
  );
  const repoId = repos?.[0]?.id ?? '';

  const { data: diffs, isLoading: diffsLoading } = useAttemptDiff(
    attemptId ?? '',
    repoId,
  );

  const isLoading = reposLoading || diffsLoading;

  const handleBack = () => {
    navigate(
      `/tasks/${taskId}/attempts/${attemptId}?project_id=${encodeURIComponent(projectId ?? '')}`,
    );
  };

  if (!taskId || !attemptId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.error')}
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
        <h1 className="text-base font-semibold">{t('git.diff')}</h1>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !repoId ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('projects.noRepos')}
          </div>
        ) : (
          <DiffViewer diffs={diffs ?? []} />
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
