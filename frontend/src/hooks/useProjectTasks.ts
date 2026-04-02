import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { TaskStatus, Task } from 'shared/types';

type TasksState = {
  tasks: Record<string, Task>;
};

export interface UseProjectTasksResult {
  tasks: Task[];
  tasksById: Record<string, Task>;
  tasksByStatus: Record<TaskStatus, Task[]>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Stream tasks for a project via WebSocket (JSON Patch) and expose as array + map.
 * Server sends initial snapshot: replace /tasks with an object keyed by id.
 * Live updates arrive at /tasks/<id> via add/replace/remove operations.
 */
export const useProjectTasks = (projectId: string): UseProjectTasksResult => {
  const endpoint = `/api/tasks/stream/ws?project_id=${encodeURIComponent(projectId)}`;

  const initialData = useCallback((): TasksState => ({ tasks: {} }), []);

  const { data, isConnected, isInitialized, error } = useJsonPatchWsStream(
    endpoint,
    !!projectId,
    initialData
  );

  const localTasksById = useMemo(() => data?.tasks ?? {}, [data?.tasks]);

  const { tasks, tasksById, tasksByStatus } = useMemo(() => {
    const merged: Record<string, Task> = { ...localTasksById };
    const byStatus: Record<TaskStatus, Task[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    Object.values(merged).forEach((task) => {
      byStatus[task.status]?.push(task);
    });

    const sorted = Object.values(merged).sort(
      (a, b) =>
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
    );

    (Object.values(byStatus) as Task[][]).forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );
    });

    return { tasks: sorted, tasksById: merged, tasksByStatus: byStatus };
  }, [localTasksById]);

  const isLoading = !isInitialized && !error; // until first snapshot

  return {
    tasks,
    tasksById,
    tasksByStatus,
    isLoading,
    isConnected,
    error,
  };
};
