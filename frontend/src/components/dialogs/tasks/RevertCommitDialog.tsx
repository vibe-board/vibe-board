import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { attemptsApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type { CommitInfo } from 'shared/types';

export interface RevertCommitDialogProps {
  commit: CommitInfo;
  attemptId: string;
  repoId: string;
}

const RevertCommitDialogImpl = NiceModal.create<RevertCommitDialogProps>(
  ({ commit, attemptId, repoId }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const [isReverting, setIsReverting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCancel = () => {
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open && !isReverting) {
        handleCancel();
      }
    };

    const handleRevert = async () => {
      setIsReverting(true);
      setError(null);

      try {
        await attemptsApi.revertCommit(attemptId, commit.sha, repoId);
        modal.resolve('confirmed');
        modal.hide();
      } catch (err) {
        const msg = String(err);
        if (msg.toLowerCase().includes('conflict')) {
          setError(
            t('tasks:commit.revertConflictError', {
              defaultValue:
                'The revert could not be completed automatically because it conflicts with other changes.',
            }) +
              '\n\n' +
              msg
          );
        } else {
          setError(msg);
        }
      } finally {
        setIsReverting(false);
      }
    };

    const shortSha = commit.sha.substring(0, 7);

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        className="sm:max-w-md"
      >
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <DialogTitle>{t('tasks:commit.revertCommit')}</DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              {t('tasks:commit.revertCommitDescription', { sha: shortSha })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert>
              <AlertDescription className="text-sm">
                {t('tasks:commit.revertWarningDescription')}
              </AlertDescription>
            </Alert>

            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-background px-1.5 py-0.5 rounded">
                  {shortSha}
                </code>
                <span className="truncate">{commit.message}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {commit.author} &middot; +{commit.additions} -{commit.deletions}{' '}
                ({commit.files_changed}{' '}
                {commit.files_changed === 1 ? 'file' : 'files'})
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="whitespace-pre-wrap">
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isReverting}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevert}
              disabled={isReverting}
            >
              {isReverting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isReverting
                ? t('tasks:commit.reverting')
                : t('tasks:commit.revert')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const RevertCommitDialog = defineModal<
  RevertCommitDialogProps,
  'confirmed' | void
>(RevertCommitDialogImpl);
