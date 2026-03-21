import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { useTaskStore, type Task, type TaskStatus } from '@/lib/store/taskStore';
import { useConnectionStore } from '@/lib/store/connectionStore';
import { tasksApi } from '@/lib/api';

export function TaskBoardPage() {
  const navigate = useNavigate();
  const { serverId, projectId } = useParams();
  const { setTasks, setLoading, addTask } = useTaskStore();
  const servers = useConnectionStore((s) => s.servers);
  const server = servers.find((s) => s.id === serverId);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo');

  useEffect(() => {
    if (!server || !projectId) return;
    setLoading(true);
    tasksApi
      .list(server.url, projectId)
      .then((data) => setTasks((data as Task[]) ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [server, projectId, setTasks, setLoading]);

  const handleCreate = async () => {
    if (!server || !projectId || !newTitle.trim()) return;
    try {
      const task = (await tasksApi.create(server.url, projectId, {
        title: newTitle.trim(),
        status: newStatus,
      })) as Task;
      addTask(task);
      setNewTitle('');
      setNewStatus('todo');
      setCreateOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTaskClick = (taskId: string) => {
    navigate(
      `/servers/${serverId}/projects/${projectId}/tasks/${taskId}`
    );
  };

  if (!server || !projectId) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-tertiary">Invalid route</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Task Board</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New Task
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <TaskBoard onTaskClick={handleTaskClick} />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title"
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as TaskStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
