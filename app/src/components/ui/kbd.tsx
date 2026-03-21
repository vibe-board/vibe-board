import type { Component } from 'solid-js';
import { cn } from '@/lib/cn';

interface KbdProps {
  children: string;
  class?: string;
}

export const Kbd: Component<KbdProps> = (props) => {
  return (
    <kbd class={cn(
      'inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded border border-border bg-surface-2 text-[10px] font-mono text-muted',
      props.class,
    )}>
      {props.children}
    </kbd>
  );
};
