import { Separator as KSeparator } from '@kobalte/core/separator';
import type { Component } from 'solid-js';
import { cn } from '@/lib/cn';

interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  class?: string;
}

export const Separator: Component<SeparatorProps> = (props) => {
  return (
    <KSeparator
      orientation={props.orientation ?? 'horizontal'}
      class={cn(
        'bg-border shrink-0',
        (props.orientation ?? 'horizontal') === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        props.class,
      )}
    />
  );
};
