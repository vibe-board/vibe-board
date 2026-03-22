import { useState } from 'react';
import { useConnectionStore, useAppStore } from '@/stores';
import { Card, Button, Input, Dialog, Badge, StatusDot, Skeleton } from '@/components/ui';
import type { TaskWithAttemptStatus, CreateTask } from '@/types';

export function TasksPage() {
  const { getActiveClient } = useConnectionStore();
  const { projects, tasks, setTasks, loading, setLoading } = useAppStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const client = getActiveClient();

  async function loadTasks() {
    if (!client) return;
    setLoading('tasks', true);
    try {
      const res = await client.get<TaskWithAttemptStatus[]>('/api/tasks');
      setTasks(res.data);
    } catch {
      // handled by store
    } finally {
      setLoading('tasks', false);
    }
  }

  async function createTask() {
    if (!client || !newTitle.trim() || !selectedProject) return;
    setCreating(true);
    try {
      const body: CreateTask = {
        project_id: selectedProject,
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
      };
      await client.post('/api/tasks', body);
      setNewTitle('');
      setNewDesc('');
      setSelectedProject('');
      setCreateOpen(false);
      await loadTasks();
    } catch {
      // handled by store
    } finally {
      setCreating(false);
    }
  }

  async function deleteTask(id: string) {
    if (!client) return;
    try {
      await client.delete(`/api/tasks/${id}`);
      setTasks(tasks.filter((t) => t.id !== id));
    } catch {
      // handled by store
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return ['pending', 'in_progress'].includes(t.status);
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">Tasks</h2>
          <p className="text-sm text-text-tertiary">{tasks.length} tasks</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadTasks} disabled={!client}>
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={!client || projects.length === 0}>
            <PlusIcon size={14} />
            New Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1">
        {(['all', 'active', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              filter === f ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {!client ? (
        <Card className="text-center py-12">
          <p className="text-sm text-text-tertiary">Connect to a server first</p>
        </Card>
      ) : loading.tasks ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-sm text-text-tertiary mb-3">No tasks found</p>
          {projects.length > 0 && (
            <Button onClick={() => setCreateOpen(true)}>Create a task</Button>
          )}
        </Card>
      ) : (
        <div className="space-y-1">
          {filteredTasks.map((task) => (
            <Card
              key={task.id}
              padding={false}
              className="group flex items-center gap-3 px-4 py-3 hover:border-border-strong transition-colors"
            >
              <StatusDot
                status={
                  task.status === 'in_progress'
                    ? 'running'
                    : task.status === 'completed'
                    ? 'completed'
                    : task.status === 'failed'
                    ? 'failed'
                    : 'pending'
                }
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{task.title}</div>
                {task.description && (
                  <div className="text-xs text-text-tertiary truncate mt-0.5">{task.description}</div>
                )}
              </div>
              <Badge variant={statusBadgeVariant(task.status)}>{task.status.replace('_', ' ')}</Badge>
              <span className="text-[10px] text-text-disabled">
                {new Date(task.created_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-error transition-all"
              >
                <TrashIcon size={14} />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Task">
        <form
          onSubmit={(e) => { e.preventDefault(); createTask(); }}
          className="space-y-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm text-text-secondary font-medium">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              required
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
            required
          />
          <Input
            label="Description"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Optional description"
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

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'in_progress': return 'warning' as const;
    case 'completed': return 'success' as const;
    case 'failed': return 'error' as const;
    default: return 'muted' as const;
  }
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
