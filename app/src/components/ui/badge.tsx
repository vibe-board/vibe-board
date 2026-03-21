import type { Component, JSX } from 'solid-js';
import { cn } from '@/lib/cn';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  class?: string;
  children: JSX.Element;
}

const variantStyles = {
  default: 'bg-accent/10 text-accent',
  success: 'bg-status-done/10 text-status-done',
  warning: 'bg-status-inprogress/10 text-status-inprogress',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-status-inreview/10 text-status-inreview',
  muted: 'bg-surface-2 text-muted',
};

export const Badge: Component<BadgeProps> = (props) => {
  return (
    <span class={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      variantStyles[props.variant ?? 'default'],
      props.class,
    )}>
      {props.children}
    </span>
  );
};

interface StatusDotProps {
  status: string;
  class?: string;
}

export const StatusDot: Component<StatusDotProps> = (props) => {
  const colorMap: Record<string, string> = {
    todo: 'bg-status-todo',
    inprogress: 'bg-status-inprogress',
    inreview: 'bg-status-inreview',
    done: 'bg-status-done',
    cancelled: 'bg-status-cancelled',
  };
  return (
    <span class={cn('inline-block h-2 w-2 rounded-full', colorMap[props.status] || 'bg-muted', props.class)} />
  );
};
