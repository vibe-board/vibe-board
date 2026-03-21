import { splitProps, type JSX, type Component, Show } from 'solid-js';
import { cn } from '@/lib/cn';

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ['label', 'error', 'class']);
  return (
    <div class="flex flex-col gap-1.5">
      <Show when={local.label}>
        <label class="text-xs font-medium text-muted">{local.label}</label>
      </Show>
      <input
        class={cn(
          'h-8 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-subtle transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
          local.error && 'border-danger focus:border-danger focus:ring-danger/30',
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
