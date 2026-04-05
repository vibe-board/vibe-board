import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos, useUpdateRepo } from '@/api/hooks/useRepos';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ReposSettings() {
  const { t } = useTranslation();
  const { data: repos = [], isLoading } = useRepos();
  const updateRepo = useUpdateRepo();

  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [setupScript, setSetupScript] = useState('');
  const [cleanupScript, setCleanupScript] = useState('');
  const [devServerScript, setDevServerScript] = useState('');
  const [copyFiles, setCopyFiles] = useState('');
  const [parallelSetup, setParallelSetup] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId) ?? null;

  // Initialize form when repo selection changes
  useEffect(() => {
    if (selectedRepo) {
      setDisplayName(selectedRepo.display_name ?? '');
      setSetupScript(selectedRepo.setup_script ?? '');
      setCleanupScript(selectedRepo.cleanup_script ?? '');
      setDevServerScript(selectedRepo.dev_server_script ?? '');
      setCopyFiles(selectedRepo.copy_files ?? '');
      setParallelSetup(selectedRepo.parallel_setup_script ?? false);
      setDirty(false);
    }
  }, [selectedRepo]);

  // Auto-select first repo
  useEffect(() => {
    if (!selectedRepoId && repos.length > 0) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos, selectedRepoId]);

  const markDirty = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setter(e.target.value);
        setDirty(true);
      },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!selectedRepo) return;
    await updateRepo.mutateAsync({
      id: selectedRepo.id,
      body: {
        display_name: displayName || null,
        setup_script: setupScript || null,
        cleanup_script: cleanupScript || null,
        dev_server_script: devServerScript || null,
        copy_files: copyFiles || null,
        parallel_setup_script: parallelSetup,
      },
    });
    setDirty(false);
  }, [
    selectedRepo,
    displayName,
    setupScript,
    cleanupScript,
    devServerScript,
    copyFiles,
    parallelSetup,
    updateRepo,
  ]);

  const handleDiscard = useCallback(() => {
    if (selectedRepo) {
      setDisplayName(selectedRepo.display_name ?? '');
      setSetupScript(selectedRepo.setup_script ?? '');
      setCleanupScript(selectedRepo.cleanup_script ?? '');
      setDevServerScript(selectedRepo.dev_server_script ?? '');
      setCopyFiles(selectedRepo.copy_files ?? '');
      setParallelSetup(selectedRepo.parallel_setup_script ?? false);
    }
    setDirty(false);
  }, [selectedRepo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  const repoOptions = repos.map((r) => ({
    value: r.id,
    label: r.display_name || r.name,
  }));

  return (
    <div className="space-y-4 p-4">
      {/* Repo selector */}
      {repos.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('settings.projects')}</label>
          <Select
            value={selectedRepoId}
            onChange={setSelectedRepoId}
            options={repoOptions}
          />
        </div>
      )}

      {repos.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">
          {t('settings.noRepos')}
        </div>
      ) : selectedRepo ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.repos')}</CardTitle>
            <CardDescription>{t('settings.reposDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={t('settings.displayName')}
              value={displayName}
              onChange={markDirty(setDisplayName)}
              placeholder={selectedRepo.name}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t('settings.setupScript')}
              </label>
              <textarea
                value={setupScript}
                onChange={markDirty(setSetupScript)}
                rows={3}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t('settings.cleanupScript')}
              </label>
              <textarea
                value={cleanupScript}
                onChange={markDirty(setCleanupScript)}
                rows={3}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t('settings.devServerScript')}
              </label>
              <textarea
                value={devServerScript}
                onChange={markDirty(setDevServerScript)}
                rows={3}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {t('settings.copyFiles')}
              </label>
              <textarea
                value={copyFiles}
                onChange={markDirty(setCopyFiles)}
                rows={3}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-foreground flex-1">
                {t('settings.parallelSetup')}
              </label>
              <button
                type="button"
                onClick={() => {
                  setParallelSetup(!parallelSetup);
                  setDirty(true);
                }}
                className={`
                  relative w-9 h-5 rounded-full transition-colors shrink-0
                  ${parallelSetup ? 'bg-primary' : 'bg-muted'}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform
                    ${parallelSetup ? 'left-[18px]' : 'left-0.5'}
                  `}
                />
              </button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky bottom-20 flex items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="flex-1 text-sm text-muted-foreground">
            {t('settings.unsavedChanges')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={updateRepo.isPending}
          >
            {t('settings.discardChanges')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateRepo.isPending}
          >
            {updateRepo.isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              t('settings.saveChanges')
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
