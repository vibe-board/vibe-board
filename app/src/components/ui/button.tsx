import { splitProps, type JSX, type Component } from 'solid-js';
import { cn } from '@/lib/cn';

const variants = {
  default: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-foreground hover:bg-surface-3',
  ghost: 'text-muted hover:text-foreground hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger-hover',
  outline: 'border border-border text-foreground hover:bg-surface-2',
};

const sizes = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-9 px-4 text-sm gap-2',
  icon: 'h-8 w-8',
  'icon-sm': 'h-7 w-7',
};

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ['variant', 'size', 'loading', 'class', 'children', 'disabled']);
  return (
    <button
      class={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors duration-[var(--transition-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 disabled:pointer-events-none cursor-default select-none',
        variants[local.variant ?? 'default'],
        sizes[local.size ?? 'md'],
        local.class,
      )}
      disabled={local.disabled || local.loading}
      {...rest}
    >
      {local.loading ? (
        <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : null}
      {local.children}
    </button>
  );
};
