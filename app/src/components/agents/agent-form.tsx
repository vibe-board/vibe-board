import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const AgentForm: Component<{
  onSubmit: (name: string, type: string) => void;
  onCancel: () => void;
}> = (props) => {
  const [name, setName] = createSignal('');
  const [type, setType] = createSignal('');

  return (
    <div class="space-y-4">
      <Input
        label="Agent Name"
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <Input
        label="Agent Type"
        value={type()}
        onInput={(e) => setType(e.currentTarget.value)}
      />
      <div class="flex gap-2 justify-end">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button onClick={() => props.onSubmit(name(), type())}>Save</Button>
      </div>
    </div>
  );
};
