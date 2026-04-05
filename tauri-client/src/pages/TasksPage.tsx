import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Project } from '@shared/types';
import { useProjectStream } from '@/api/hooks/useProjectStream';
import { useProjects } from '@/api/hooks/useProjects';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { CreateTaskForm } from '@/components/tasks/CreateTaskForm';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Plus } from 'lucide-react';

export default function TasksPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = searchParams.get('project_id');

  const { projects: streamProjects, isInitialized } = useProjectStream();
  const { data: restProjects, isLoading } = useProjects({
    enabled: !isInitialized,
  });

  const projects: Project[] = isInitialized
    ? Object.values(streamProjects ?? {})
    : Array.isArray(restProjects) ? restProjects : [];

  // No project selected — show project picker
  if (!projectId) {
    if (!isInitialized && isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <div className="p-4 text-center text-muted-foreground">
          {t('projects.noProjects')}
        </div>
      );
    }

    return (
      <div className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">
          {t('projects.selectProject')}
        </h2>
        <Select
          value=""
          onChange={(value) =>
            navigate(`/tasks?project_id=${encodeURIComponent(value)}`)
          }
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          placeholder={t('projects.selectProject')}
        />
      </div>
    );
  }

  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="relative h-full">
      <KanbanBoard projectId={projectId} />
      <button
        onClick={() => setShowCreateForm(true)}
        className="absolute bottom-4 right-4 flex items-center justify-center h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        aria-label={t('tasks.create')}
      >
        <Plus className="h-6 w-6" />
      </button>
      <CreateTaskForm
        projectId={projectId}
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
      />
    </div>
  );
}
