import { Popover as KPopover } from '@kobalte/core/popover';
import type { Component, JSX } from 'solid-js';
import { cn } from '@/lib/cn';

export const Popover = KPopover;
export const PopoverTrigger = KPopover.Trigger;

export const PopoverContent: Component<{ children: JSX.Element; class?: string }> = (props) => {
  return (
    <KPopover.Portal>
      <KPopover.Content class={cn(
        'z-50 w-72 rounded-lg border border-border bg-background p-4 shadow-popover animate-in fade-in-0 zoom-in-95',
        props.class,
      )}>
        {props.children}
      </KPopover.Content>
    </KPopover.Portal>
  );
};
