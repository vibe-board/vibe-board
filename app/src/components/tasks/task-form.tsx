import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface TaskFormProps {
  onSubmit: (title: string, description: string | null) => void;
  onCancel: () => void;
  initialTitle?: string;
  initialDescription?: string;
}

export const TaskForm: Component<TaskFormProps> = (props) => {
  const [title, setTitle] = createSignal(props.initialTitle ?? '');
  const [description, setDescription] = createSignal(
    props.initialDescription ?? '',
  );

  return (
    <div class="space-y-4">
      <Input
        label="Title"
        placeholder="Task title"
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
      />
      <Textarea
        label="Description"
        placeholder="Optional description..."
        rows={4}
        value={description()}
        onInput={(e) => setDescription(e.currentTarget.value)}
      />
      <div class="flex gap-2 justify-end">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => props.onSubmit(title(), description() || null)}
          disabled={!title().trim()}
        >
          Create Task
        </Button>
      </div>
    </div>
  );
};
