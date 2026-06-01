import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, getErrorMessage } from '@/lib/modals';
import { useApi } from '@/hooks/useApi';
import type { GlabCliSetupError } from 'shared/types';
import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GlabCliSetupDialogProps {
  attemptId: string;
}

export type GlabCliSupportVariant = 'homebrew' | 'manual';

export interface GlabCliSupportContent {
  message: string;
  variant: GlabCliSupportVariant | null;
}

export const mapGlabCliErrorToUi = (
  error: GlabCliSetupError | null,
  fallbackMessage: string,
  t: (key: string) => string
): GlabCliSupportContent => {
  if (!error) {
    return { message: fallbackMessage, variant: null };
  }

  if (error === 'BREW_MISSING') {
    return {
      message: t('settings:integrations.gitlab.cliSetup.errors.brewMissing'),
      variant: 'homebrew',
    };
  }

  if (error === 'SETUP_HELPER_NOT_SUPPORTED') {
    return {
      message: t('settings:integrations.gitlab.cliSetup.errors.notSupported'),
      variant: 'manual',
    };
  }

  if (typeof error === 'object' && 'OTHER' in error) {
    return {
      message: error.OTHER.message || fallbackMessage,
      variant: null,
    };
  }

  return { message: fallbackMessage, variant: null };
};

export const GlabCliHelpInstructions = ({
  variant,
  t,
}: {
  variant: GlabCliSupportVariant;
  t: (key: string) => string;
}) => {
  if (variant === 'homebrew') {
    return (
      <div className="space-y-2 text-sm">
        <p>
          {t('settings:integrations.gitlab.cliSetup.help.homebrew.description')}{' '}
          <a
            href="https://brew.sh/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {t('settings:integrations.gitlab.cliSetup.help.homebrew.brewSh')}
          </a>{' '}
          {t(
            'settings:integrations.gitlab.cliSetup.help.homebrew.manualInstall'
          )}
        </p>
        <pre className="rounded bg-muted px-2 py-1 text-xs">
          brew install glab
        </pre>
        <p>
          {t(
            'settings:integrations.gitlab.cliSetup.help.homebrew.afterInstall'
          )}
          <br />
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            glab auth login --hostname gitlab.com --web
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p>
        {t('settings:integrations.gitlab.cliSetup.help.manual.description')}{' '}
        <a
          href="https://gitlab.com/gitlab-org/cli"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {t('settings:integrations.gitlab.cliSetup.help.manual.officialDocs')}
        </a>{' '}
        {t('settings:integrations.gitlab.cliSetup.help.manual.andAuthenticate')}
      </p>
      <pre className="rounded bg-muted px-2 py-1 text-xs whitespace-pre-wrap">
        {`brew install glab
glab auth login --hostname gitlab.com --web    # for gitlab.com
glab auth login --hostname HOSTNAME --web      # for self-hosted (replace HOSTNAME)`}
      </pre>
    </div>
  );
};

const GlabCliSetupDialogImpl = NiceModal.create<GlabCliSetupDialogProps>(
  ({ attemptId }) => {
    const { attemptsApi } = useApi();
    const modal = useModal();
    const { t } = useTranslation();
    const [isRunning, setIsRunning] = useState(false);
    const [errorInfo, setErrorInfo] = useState<{
      error: GlabCliSetupError;
      message: string;
      variant: GlabCliSupportVariant | null;
    } | null>(null);
    const pendingResultRef = useRef<GlabCliSetupError | null>(null);
    const hasResolvedRef = useRef(false);

    const handleRunSetup = async () => {
      setIsRunning(true);
      setErrorInfo(null);
      pendingResultRef.current = null;

      try {
        await attemptsApi.setupGlabCli(attemptId);
        hasResolvedRef.current = true;
        modal.resolve(null);
        modal.hide();
      } catch (err: unknown) {
        const rawMessage =
          getErrorMessage(err) ||
          t('settings:integrations.gitlab.cliSetup.errors.setupFailed');

        const maybeErrorData =
          typeof err === 'object' && err !== null && 'error_data' in err
            ? (err as { error_data?: unknown }).error_data
            : undefined;

        const isGlabCliSetupError = (x: unknown): x is GlabCliSetupError =>
          x === 'BREW_MISSING' ||
          x === 'SETUP_HELPER_NOT_SUPPORTED' ||
          (typeof x === 'object' && x !== null && 'OTHER' in x);

        const errorData = isGlabCliSetupError(maybeErrorData)
          ? maybeErrorData
          : undefined;

        const resolvedError: GlabCliSetupError = errorData ?? {
          OTHER: { message: rawMessage },
        };
        const ui = mapGlabCliErrorToUi(resolvedError, rawMessage, t);

        pendingResultRef.current = resolvedError;
        setErrorInfo({
          error: resolvedError,
          message: ui.message,
          variant: ui.variant,
        });
      } finally {
        setIsRunning(false);
      }
    };

    const handleClose = () => {
      if (!hasResolvedRef.current) {
        modal.resolve(pendingResultRef.current);
      }
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleClose()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('settings:integrations.gitlab.cliSetup.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>{t('settings:integrations.gitlab.cliSetup.description')}</p>

            <div className="space-y-2">
              <p className="text-sm">
                {t('settings:integrations.gitlab.cliSetup.setupWillTitle')}
              </p>
              <ol className="text-sm list-decimal list-inside space-y-1 ml-2">
                <li>
                  {t(
                    'settings:integrations.gitlab.cliSetup.steps.checkInstalled'
                  )}
                </li>
                <li>
                  {t(
                    'settings:integrations.gitlab.cliSetup.steps.installHomebrew'
                  )}
                </li>
                <li>
                  {t(
                    'settings:integrations.gitlab.cliSetup.steps.authenticate'
                  )}
                </li>
              </ol>
              <p className="text-sm text-muted-foreground mt-4">
                {t('settings:integrations.gitlab.cliSetup.setupNote')}
              </p>
            </div>
            {errorInfo && (
              <Alert variant="destructive">
                <AlertDescription className="space-y-2">
                  <p>{errorInfo.message}</p>
                  {errorInfo.variant && (
                    <GlabCliHelpInstructions
                      variant={errorInfo.variant}
                      t={t}
                    />
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleRunSetup} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings:integrations.gitlab.cliSetup.running')}
                </>
              ) : (
                t('settings:integrations.gitlab.cliSetup.runSetup')
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isRunning}
            >
              {t('common:buttons.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const GlabCliSetupDialog = defineModal<
  GlabCliSetupDialogProps,
  GlabCliSetupError | null
>(GlabCliSetupDialogImpl);
