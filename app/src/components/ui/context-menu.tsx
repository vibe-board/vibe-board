import { ContextMenu as KContextMenu } from '@kobalte/core/context-menu';
import type { Component, JSX } from 'solid-js';
import { cn } from '@/lib/cn';

export const ContextMenu = KContextMenu;
export const ContextMenuTrigger = KContextMenu.Trigger;

export const ContextMenuContent: Component<{ children: JSX.Element; class?: string }> = (props) => {
  return (
    <KContextMenu.Portal>
      <KContextMenu.Content class={cn(
        'z-50 min-w-[8rem] rounded-lg border border-border bg-background p-1 shadow-popover animate-in fade-in-0 zoom-in-95',
        props.class,
      )}>
        {props.children}
      </KContextMenu.Content>
    </KContextMenu.Portal>
  );
};

export const ContextMenuItem: Component<{ children: JSX.Element; onSelect?: () => void; class?: string }> = (props) => {
  return (
    <KContextMenu.Item
      onSelect={props.onSelect}
      class={cn('flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-default outline-none hover:bg-surface-2 data-[highlighted]:bg-surface-2', props.class)}
    >
      {props.children}
    </KContextMenu.Item>
  );
};
