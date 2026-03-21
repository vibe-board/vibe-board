import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const ProjectForm: Component<{
  onSubmit: (name: string) => void;
  onCancel: () => void;
}> = (props) => {
  const [name, setName] = createSignal('');

  return (
    <div class="space-y-4">
      <Input
        label="Project Name"
        placeholder="My Project"
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <div class="flex gap-2 justify-end">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => props.onSubmit(name())}
          disabled={!name().trim()}
        >
          Create
        </Button>
      </div>
    </div>
  );
};
