import { createSignal, type Component } from 'solid-js';
import { tasksApi } from '@/api/endpoints/tasks';
import { Plus } from 'lucide-solid';

interface QuickAddProps {
  projectId: string;
  onCreated: () => void;
}

export const QuickAdd: Component<QuickAddProps> = (props) => {
  const [editing, setEditing] = createSignal(false);
  const [title, setTitle] = createSignal('');

  const handleSubmit = async () => {
    const t = title().trim();
    if (!t) return;
    await tasksApi.create({
      project_id: props.projectId,
      title: t,
      description: null,
      status: 'todo',
      parent_workspace_id: null,
      image_ids: null,
    });
    setTitle('');
    setEditing(false);
    props.onCreated();
  };

  return editing() ? (
    <div class="px-1 pb-1">
      <input
        autofocus
        class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent"
        placeholder="Task title..."
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => {
          if (!title().trim()) setEditing(false);
        }}
      />
    </div>
  ) : (
    <button
      class="flex items-center gap-1.5 px-2 py-1.5 text-xs text-subtle hover:text-foreground transition-colors"
      onClick={() => setEditing(true)}
    >
      <Plus class="h-3.5 w-3.5" />
      New task
    </button>
  );
};
