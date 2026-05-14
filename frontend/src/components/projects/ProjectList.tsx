import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Project } from 'shared/types';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import {
  AlertCircle,
  Loader2,
  Plus,
  ArrowUpDown,
  LayoutGrid,
} from 'lucide-react';
import ProjectCard from '@/components/projects/ProjectCard.tsx';
import { ProjectOrderCard } from '@/components/projects/ProjectOrderCard.tsx';
import { useKeyCreate, Scope } from '@/keyboard';
import { useProjects } from '@/hooks/useProjects';
import { useUserSystem } from '@/components/ConfigProvider';
import { useProjectsNavigation } from '@/contexts/ProjectsNavigationContext';

export function ProjectList() {
  const navigate = useNavigate();
  const { openProject } = useProjectsNavigation();
  const { t } = useTranslation('projects');
  const { projects, isLoading, error: projectsError } = useProjects();
  const { config, updateAndSaveConfig } = useUserSystem();
  const [error, setError] = useState('');
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const [showOrderView, setShowOrderView] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const handleCreateProject = async () => {
    try {
      const result = await ProjectFormDialog.show({});
      if (result.status === 'saved') return;
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  // Semantic keyboard shortcut for creating new project
  useKeyCreate(handleCreateProject, { scope: Scope.PROJECTS });

  const handleEditProject = (project: Project) => {
    navigate(`/settings/projects?projectId=${project.id}`);
  };

  const handleOpenProject = (project: Project) => {
    if (openProject) {
      openProject(project);
      return;
    }
    navigate(`/local-projects/${project.id}/tasks`);
  };

  const handleReorder = async (newOrder: string[]) => {
    setSavingOrder(true);
    try {
      await updateAndSaveConfig({ project_order: newOrder });
    } catch (err) {
      console.error('Failed to save project order:', err);
      setError(t('order.saveError', 'Failed to save project order'));
    } finally {
      setSavingOrder(false);
    }
  };

  // Sort projects by order if available
  const sortedProjects = (() => {
    const projectOrder = config?.project_order;
    if (!projectOrder || projectOrder.length === 0) {
      return projects;
    }

    const orderMap = new Map(projectOrder.map((id, i) => [id, i]));
    const ordered: Project[] = [];
    const unordered: Project[] = [];

    for (const project of projects) {
      if (orderMap.has(project.id)) {
        ordered.push(project);
      } else {
        unordered.push(project);
      }
    }

    ordered.sort((a, b) => {
      const ai = orderMap.get(a.id) ?? 0;
      const bi = orderMap.get(b.id) ?? 0;
      return ai - bi;
    });

    return [...ordered, ...unordered];
  })();

  // Set initial focus when projects are loaded
  useEffect(() => {
    if (sortedProjects.length === 0) {
      setFocusedProjectId(null);
      return;
    }

    if (
      !focusedProjectId ||
      !sortedProjects.some((p) => p.id === focusedProjectId)
    ) {
      setFocusedProjectId(sortedProjects[0].id);
    }
  }, [sortedProjects, focusedProjectId]);

  return (
    <div className="space-y-6 p-8 pb-16 md:pb-8 h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOrderView(!showOrderView)}
          >
            {showOrderView ? (
              <>
                <LayoutGrid className="mr-2 h-4 w-4" />
                {t('view.grid', 'Grid View')}
              </>
            ) : (
              <>
                <ArrowUpDown className="mr-2 h-4 w-4" />
                {t('view.order', 'Order Projects')}
              </>
            )}
          </Button>
          <Button onClick={handleCreateProject}>
            <Plus className="mr-2 h-4 w-4" />
            {t('createProject')}
          </Button>
        </div>
      </div>

      {(error || projectsError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || projectsError?.message || t('errors.fetchFailed')}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : sortedProjects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('empty.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('empty.description')}
            </p>
            <Button className="mt-4" onClick={handleCreateProject}>
              <Plus className="mr-2 h-4 w-4" />
              {t('empty.createFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : showOrderView ? (
        <div className="max-w-2xl">
          <ProjectOrderCard
            projects={sortedProjects}
            projectOrder={config?.project_order}
            disabled={savingOrder}
            onReorder={handleReorder}
          />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isFocused={focusedProjectId === project.id}
              setError={setError}
              onEdit={handleEditProject}
              onOpen={handleOpenProject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
