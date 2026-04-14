import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import type { Task } from 'shared/types';

interface UseTaskHistoryResult {
  tasks: Task[];
  isLoading: boolean;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  isLoadingMore: boolean;
}

export const useTaskHistory = (projectId: string): UseTaskHistoryResult => {
  const { tasksApi } = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  const loadInitial = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    cursorRef.current = undefined;
    try {
      const result = await tasksApi.getHistory(projectId, { limit: 50 });
      setTasks(result.tasks);
      setHasMore(result.has_more);
      setTotalCount(Number(result.total_count));
      if (result.tasks.length > 0) {
        cursorRef.current = result.tasks[result.tasks.length - 1].created_at;
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !projectId) return;
    setIsLoadingMore(true);
    try {
      const result = await tasksApi.getHistory(projectId, {
        cursor: cursorRef.current,
        limit: 50,
      });
      setTasks((prev) => [...prev, ...result.tasks]);
      setHasMore(result.has_more);
      if (result.tasks.length > 0) {
        cursorRef.current = result.tasks[result.tasks.length - 1].created_at;
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, projectId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  return { tasks, isLoading, hasMore, totalCount, loadMore, isLoadingMore };
};
