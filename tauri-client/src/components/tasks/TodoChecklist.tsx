import { useTranslation } from 'react-i18next';
import type { NormalizedEntry } from '@shared/types';
import { useTodos } from '@/lib/useTodos';
import { CircleCheck, CircleDot, Circle, ChevronDown, ChevronRight } from 'lucide-react';

function getStatusIcon(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'completed')
    return <CircleCheck className="h-4 w-4 text-green-500" />;
  if (s === 'in_progress' || s === 'in-progress')
    return <CircleDot className="h-4 w-4 text-blue-500" />;
  if (s === 'cancelled')
    return <Circle className="h-4 w-4 text-muted-foreground/50" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

interface TodoChecklistProps {
  entries: NormalizedEntry[];
  collapsed?: boolean;
  onToggle?: () => void;
}

export function TodoChecklist({ entries, collapsed, onToggle }: TodoChecklistProps) {
  const { t } = useTranslation();
  const { todos } = useTodos(entries);

  if (todos.length === 0) return null;

  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-4 py-2 w-full text-left text-sm font-medium active:bg-muted/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
        {t('tasks.todos')} ({todos.length})
      </button>
      {!collapsed && (
        <div className="px-4 pb-3">
          <ul className="space-y-1.5">
            {todos.map((todo, index) => (
              <li
                key={`${todo.content}-${index}`}
                className="flex items-start gap-2"
              >
                <span className="mt-0.5 shrink-0">
                  {getStatusIcon(todo.status)}
                </span>
                <span
                  className={`text-sm leading-5 ${
                    todo.status?.toLowerCase() === 'cancelled'
                      ? 'line-through text-muted-foreground/50'
                      : ''
                  }`}
                >
                  {todo.content}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
