import { splitProps, type JSX, type Component, Show } from 'solid-js';
import { cn } from '@/lib/cn';

interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: Component<TextareaProps> = (props) => {
  const [local, rest] = splitProps(props, ['label', 'error', 'class']);
  return (
    <div class="flex flex-col gap-1.5">
      <Show when={local.label}>
        <label class="text-xs font-medium text-muted">{local.label}</label>
      </Show>
      <textarea
        class={cn(
          'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-none',
          local.error && 'border-danger',
          local.class,
        )}
        {...rest}
      />
      <Show when={local.error}>
        <p class="text-xs text-danger">{local.error}</p>
      </Show>
    </div>
  );
};
