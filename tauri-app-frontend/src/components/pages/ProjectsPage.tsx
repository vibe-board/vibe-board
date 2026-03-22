import { useState } from 'react';
import { useConnectionStore, useAppStore } from '@/stores';
import { Card, Button, Input, Dialog, Badge, Skeleton } from '@/components/ui';
import type { Project, CreateProject } from '@/types';

export function ProjectsPage() {
  const { getActiveClient } = useConnectionStore();
  const { projects, setProjects, loading, setLoading } = useAppStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPath, setNewPath] = useState('');
  const [creating, setCreating] = useState(false);

  const client = getActiveClient();

  async function loadProjects() {
    if (!client) return;
    setLoading('projects', true);
    try {
      const res = await client.get<Project[]>('/api/projects');
      setProjects(res.data);
    } catch {
      // handled by store
    } finally {
      setLoading('projects', false);
    }
  }

  async function createProject() {
    if (!client || !newName.trim()) return;
    setCreating(true);
    try {
      const body: CreateProject = {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        repositories: newPath.trim() ? [{ path: newPath.trim() }] : [],
      };
      await client.post('/api/projects', body);
      setNewName('');
      setNewDesc('');
      setNewPath('');
      setCreateOpen(false);
      await loadProjects();
    } catch {
      // handled by store
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    if (!client) return;
    try {
      await client.delete(`/api/projects/${id}`);
      setProjects(projects.filter((p) => p.id !== id));
    } catch {
      // handled by store
    }
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">Projects</h2>
          <p className="text-sm text-text-tertiary">{projects.length} projects</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadProjects} disabled={!client}>
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={!client}>
            <PlusIcon size={14} />
            New Project
          </Button>
        </div>
      </div>

      {!client ? (
        <Card className="text-center py-12">
          <p className="text-sm text-text-tertiary">Connect to a server first</p>
        </Card>
      ) : loading.projects ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-sm text-text-tertiary mb-3">No projects yet</p>
          <Button onClick={() => setCreateOpen(true)}>Create your first project</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((project) => (
            <Card key={project.id} className="group hover:border-border-strong transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-text-primary truncate flex-1">{project.name}</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                  className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-error transition-all ml-2"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
              {project.description && (
                <p className="text-xs text-text-tertiary line-clamp-2 mb-2">{project.description}</p>
              )}
              <div className="flex items-center gap-2">
                <Badge variant="muted">{project.path.split('/').pop()}</Badge>
                <span className="text-[10px] text-text-disabled ml-auto">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Project">
        <form
          onSubmit={(e) => { e.preventDefault(); createProject(); }}
          className="space-y-3"
        >
          <Input
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="My Project"
            autoFocus
            required
          />
          <Input
            label="Description"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Optional description"
          />
          <Input
            label="Repository Path"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="/path/to/repo"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
