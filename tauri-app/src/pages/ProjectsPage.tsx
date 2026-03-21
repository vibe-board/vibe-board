import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, FolderKanban, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectStore, type Project } from '@/lib/store/projectStore';
import { useConnectionStore } from '@/lib/store/connectionStore';
import { projectsApi } from '@/lib/api';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { serverId } = useParams();
  const { projects, setProjects, isLoading, setLoading, addProject, removeProject } =
    useProjectStore();
  const servers = useConnectionStore((s) => s.servers);
  const server = servers.find((s) => s.id === serverId);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    if (!server) return;
    setLoading(true);
    projectsApi
      .list(server.url)
      .then((data) => setProjects(data as Project[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [server, setProjects, setLoading]);

  const handleCreate = async () => {
    if (!server || !newName.trim()) return;
    try {
      const project = (await projectsApi.create(server.url, {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      })) as Project;
      addProject(project);
      setNewName('');
      setNewDesc('');
      setCreateOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!server) return;
    try {
      await projectsApi.delete(server.url, projectId);
      removeProject(projectId);
    } catch (err) {
      console.error(err);
    }
  };

  if (!server) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-tertiary">Server not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
          <p className="text-sm text-text-secondary">{server.name}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="flex items-center justify-center border-dashed p-8">
          <div className="text-center">
            <FolderKanban className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-tertiary">No projects yet</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setCreateOpen(true)}
            >
              Create your first project
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer p-4 transition-colors hover:border-border-focus"
              onClick={() =>
                navigate(
                  `/servers/${serverId}/projects/${project.id}/board`
                )
              }
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-text-primary">
                    {project.name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-text-tertiary hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {project.description && (
                <p className="mt-1 text-xs text-text-tertiary line-clamp-2">
                  {project.description}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-desc">Description</Label>
              <Input
                id="project-desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
