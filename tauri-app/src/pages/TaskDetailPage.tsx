import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Tag, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTaskStore, type Task, type TaskStatus } from '@/lib/store/taskStore';
import { useConnectionStore } from '@/lib/store/connectionStore';
import { tasksApi } from '@/lib/api';

const statusVariant: Record<TaskStatus, 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled'> = {
  todo: 'todo',
  in_progress: 'inprogress',
  in_review: 'inreview',
  done: 'done',
  cancelled: 'cancelled',
};

export function TaskDetailPage() {
  const { serverId, projectId, taskId } = useParams();
  const { tasks, setTasks, updateTask, isLoading, setLoading } = useTaskStore();
  const servers = useConnectionStore((s) => s.servers);
  const server = servers.find((s) => s.id === serverId);

  const task = tasks.find((t) => t.id === taskId);

  useEffect(() => {
    if (!server || !projectId || !taskId) return;
    setLoading(true);
    tasksApi
      .get(server.url, projectId, taskId)
      .then((data) => setTasks([data as Task]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [server, projectId, taskId, setTasks, setLoading]);

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!server || !projectId || !taskId) return;
    try {
      await tasksApi.update(server.url, projectId, taskId, {
        status: newStatus,
      });
      updateTask(taskId, { status: newStatus });
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Separator />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-tertiary">Task not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 gap-1 text-text-secondary"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <h1 className="text-xl font-semibold text-text-primary">{task.title}</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Status:</span>
          <Select value={task.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-7 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Badge variant={statusVariant[task.status]}>{task.status.replace('_', ' ')}</Badge>
      </div>

      <Separator className="my-4" />

      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Clock className="h-4 w-4" />
          <span>Created: {new Date(task.created_at).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Clock className="h-4 w-4" />
          <span>Updated: {new Date(task.updated_at).toLocaleString()}</span>
        </div>
        {task.assignee && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <User className="h-4 w-4" />
            <span>Assignee: {task.assignee}</span>
          </div>
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-text-tertiary">
            <Tag className="h-4 w-4" />
            <span>Tags</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {task.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {task.description && (
        <>
          <Separator className="my-4" />
          <div>
            <h3 className="mb-2 text-sm font-medium text-text-secondary">
              Description
            </h3>
            <p className="text-sm text-text-primary whitespace-pre-wrap">
              {task.description}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
