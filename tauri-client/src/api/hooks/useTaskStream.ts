import { useEffect, useMemo, useRef } from 'react';
import type { Task } from '@shared/types';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import { notifyTaskComplete } from '@/lib/notifications';

interface TaskStreamState {
  tasks: Record<string, Task>;
}

export function useTaskStream(projectId: string | undefined) {
  const endpoint = projectId
    ? `/tasks/stream/ws?project_id=${projectId}`
    : undefined;

  const { data, isInitialized, isConnected, error } =
    useJsonPatchWsStream<TaskStreamState>(endpoint, !!projectId, () => ({
      tasks: {},
    }));

  const tasks = useMemo(() => data?.tasks, [data]);

  // Fire notifications on task status transitions
  const prevTasksRef = useRef<Record<string, Task>>({});

  useEffect(() => {
    if (!isInitialized || !tasks) return;

    const prev = prevTasksRef.current;
    for (const [id, task] of Object.entries(tasks)) {
      const prevTask = prev[id];
      if (!prevTask) continue;

      // Task just completed
      if (prevTask.status !== 'done' && task.status === 'done') {
        notifyTaskComplete(task.title, true);
      }
      // Task attempt just failed
      if (!prevTask.last_attempt_failed && task.last_attempt_failed) {
        notifyTaskComplete(task.title, false);
      }
    }

    prevTasksRef.current = { ...tasks };
  }, [tasks, isInitialized]);

  return { tasks, isInitialized, isConnected, error };
}
