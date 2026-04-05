import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjects, useUpdateProject, useProjectRepos } from '@/api/hooks/useProjects';
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
import { FolderGit2 } from 'lucide-react';

export default function ProjectSettings() {
  const { t } = useTranslation();
  const { data: projects, isLoading } = useProjects();
  const updateProject = useUpdateProject();

  const [selectedId, setSelectedId] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data: repos } = useProjectRepos(selectedId);

  // When projects load, select the first one
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedId) {
      setSelectedId(projects[0].id);
      setProjectName(projects[0].name);
    }
  }, [projects, selectedId]);

  const handleSelectProject = useCallback(
    (id: string) => {
      if (dirty) return; // prevent switching with unsaved changes
      setSelectedId(id);
      const proj = projects?.find((p) => p.id === id);
      setProjectName(proj?.name ?? '');
      setDirty(false);
    },
    [projects, dirty],
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setProjectName(e.target.value);
      setDirty(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!selectedId) return;
    await updateProject.mutateAsync({
      id: selectedId,
      body: { name: projectName },
    });
    setDirty(false);
  }, [selectedId, projectName, updateProject]);

  const handleDiscard = useCallback(() => {
    const proj = projects?.find((p) => p.id === selectedId);
    setProjectName(proj?.name ?? '');
    setDirty(false);
  }, [projects, selectedId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  const projectOptions =
    projects?.map((p) => ({ value: p.id, label: p.name })) ?? [];

  return (
    <div className="space-y-4 p-4">
      {/* Project selector */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.projectSelect')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedId}
            onChange={handleSelectProject}
            options={projectOptions}
            disabled={dirty}
          />
        </CardContent>
      </Card>

      {selectedId && (
        <>
          {/* Project name */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.projectName')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                label={t('settings.projectName')}
                value={projectName}
                onChange={handleNameChange}
                placeholder={t('settings.projectNamePlaceholder')}
              />
            </CardContent>
          </Card>

          {/* Repositories */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.repositories')}</CardTitle>
              <CardDescription>
                {repos?.length ?? 0}{' '}
                {repos?.length === 1
                  ? t('settings.repositories').toLowerCase()
                  : t('settings.repositories').toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {repos && repos.length > 0 ? (
                <div className="space-y-2">
                  {repos.map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {repo.display_name || repo.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {repo.path}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('settings.noRepositories')}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

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
            disabled={updateProject.isPending}
          >
            {t('settings.discardChanges')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateProject.isPending}
          >
            {updateProject.isPending ? (
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
