import type { Component, JSX } from 'solid-js';
import { cn } from '@/lib/cn';

interface ScrollAreaProps {
  children: JSX.Element;
  class?: string;
}

export const ScrollArea: Component<ScrollAreaProps> = (props) => {
  return (
    <div class={cn('overflow-auto', props.class)}>
      {props.children}
    </div>
  );
};
