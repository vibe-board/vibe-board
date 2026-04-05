import { useMemo } from 'react';
import type { TodoItem, NormalizedEntry } from '@shared/types';

interface UseTodosResult {
  todos: TodoItem[];
  inProgressTodo: TodoItem | null;
}

/**
 * Extracts the latest TODO state from normalized conversation entries.
 * Scans for todo_management action entries and returns the most recent list.
 */
export function useTodos(entries: NormalizedEntry[]): UseTodosResult {
  return useMemo(() => {
    let latestTodos: TodoItem[] = [];
    let lastUpdatedTime: string | null = null;

    for (const entry of entries) {
      if (
        entry.entry_type?.type === 'tool_use' &&
        entry.entry_type?.action_type?.action === 'todo_management'
      ) {
        const actionType = entry.entry_type.action_type;
        const partialTodos = actionType.todos ?? [];
        const currentTimestamp =
          entry.timestamp ?? new Date().toISOString();

        const hasMeaningfulTodos =
          partialTodos.length > 0 &&
          partialTodos.every(
            (todo) =>
              todo.content && todo.content.trim().length > 0 && todo.status,
          );
        const isNewerThanLatest =
          !lastUpdatedTime || currentTimestamp >= lastUpdatedTime;

        if (
          hasMeaningfulTodos ||
          (isNewerThanLatest && latestTodos.length === 0)
        ) {
          latestTodos = partialTodos;
          lastUpdatedTime = currentTimestamp;
        }
      }
    }

    const inProgressTodo =
      latestTodos.find((todo) => {
        const status = todo.status?.toLowerCase();
        return status === 'in_progress' || status === 'in-progress';
      }) ?? null;

    return {
      todos: latestTodos,
      inProgressTodo,
    };
  }, [entries]);
}
