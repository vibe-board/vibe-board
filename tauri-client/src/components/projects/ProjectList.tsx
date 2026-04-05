import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Project } from '@shared/types';
import { useProjectStream } from '@/api/hooks/useProjectStream';
import { useProjects } from '@/api/hooks/useProjects';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function ProjectList() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { projects: streamProjects, isInitialized } = useProjectStream();
  const { data: restProjects, isLoading } = useProjects({
    enabled: !isInitialized,
  });

  const projects: Project[] = isInitialized
    ? Object.values(streamProjects ?? {})
    : Array.isArray(restProjects) ? restProjects : [];

  if (!isInitialized && isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title={t('projects.noProjects')}
        description={t('projects.noProjectsHint')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="active:scale-[0.98] transition-transform cursor-pointer"
          onClick={() =>
            navigate(`/tasks?project_id=${encodeURIComponent(project.id)}`)
          }
        >
          <CardHeader>
            <CardTitle className="text-base">{project.name}</CardTitle>
            {project.default_agent_working_dir && (
              <CardDescription className="text-xs truncate">
                {project.default_agent_working_dir}
              </CardDescription>
            )}
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
