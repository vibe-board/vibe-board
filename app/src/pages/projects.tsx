import { createResource, createSignal, Show, type Component } from 'solid-js';
import { projectsApi } from '@/api/endpoints/projects';
import { ProjectList } from '@/components/projects/project-list';
import { ProjectForm } from '@/components/projects/project-form';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-solid';

const ProjectsPage: Component = () => {
  const [projects, { refetch }] = createResource(() => projectsApi.list());
  const [showCreate, setShowCreate] = createSignal(false);

  const handleCreate = async (name: string) => {
    await projectsApi.create({ name, repositories: [] });
    setShowCreate(false);
    refetch();
  };

  return (
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-xl font-bold text-foreground">Projects</h1>
          <p class="text-sm text-muted mt-1">Manage your coding projects</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus class="h-4 w-4" /> New Project
        </Button>
      </div>

      <Show when={!projects.loading} fallback={
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Skeleton class="h-24" />
          <Skeleton class="h-24" />
          <Skeleton class="h-24" />
        </div>
      }>
        <Show when={projects()} fallback={<p class="text-sm text-muted">Failed to load projects. Is the server running?</p>}>
          {(data) => <ProjectList projects={data()} />}
        </Show>
      </Show>

      <Dialog open={showCreate()} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogTitle>New Project</DialogTitle>
          <ProjectForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectsPage;
