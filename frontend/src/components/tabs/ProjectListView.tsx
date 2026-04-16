import { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  Plus,
  Pin,
  ExternalLink,
  MoreHorizontal,
  AlertCircle,
} from 'lucide-react';
import { useConnection } from '@/contexts/ConnectionContext';
import type { ConnectionProject } from '@/lib/connections/types';

interface ProjectListViewProps {
  subtitle?: string;
  onOpenProject: (project: ConnectionProject) => void;
}

export function ProjectListView({
  subtitle,
  onOpenProject,
}: ProjectListViewProps) {
  const conn = useConnection();
  const [projects, setProjects] = useState<ConnectionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    setLoading(true);
    setError(null);
    conn
      .listProjects()
      .then(setProjects)
      .catch((e: unknown) => {
        setProjects([]);
        setError(e instanceof Error ? e.message : 'Failed to load projects');
      })
      .finally(() => setLoading(false));
  }, [conn]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            {subtitle && (
              <p className="text-sm text-foreground/50">{subtitle}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin mr-2 text-foreground/50" />
            <span className="text-sm text-foreground/50">
              Loading projects...
            </span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
            <p className="mt-2 text-sm text-foreground/50">
              This machine has no projects.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCardSimple
                key={project.id}
                project={project}
                onSelect={() => onOpenProject(project)}
                onPin={() => onOpenProject(project)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCardSimple({
  project,
  onSelect,
  onPin,
}: {
  project: ConnectionProject;
  onSelect: () => void;
  onPin: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="border border-border rounded-lg p-4 bg-background hover:shadow-md transition-shadow cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold truncate flex-1">
          {project.name}
        </h3>
        <div className="relative shrink-0 ml-2">
          <button
            className="p-1 rounded hover:bg-foreground/10"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal size={16} className="text-foreground/50" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[160px]">
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-foreground/5"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                  setShowMenu(false);
                }}
              >
                <Pin size={14} /> Pin to tab bar
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-foreground/5"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                  setShowMenu(false);
                }}
              >
                <ExternalLink size={14} /> Open
              </button>
            </div>
          )}
        </div>
      </div>
      {project.path && (
        <p className="text-sm text-foreground/40 mt-1 truncate">
          {project.path}
        </p>
      )}
    </div>
  );
}
