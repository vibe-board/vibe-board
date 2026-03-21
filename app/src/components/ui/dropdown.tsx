import { DropdownMenu as KDropdownMenu } from '@kobalte/core/dropdown-menu';
import type { Component, JSX } from 'solid-js';
import { cn } from '@/lib/cn';

export const DropdownMenu = KDropdownMenu;
export const DropdownMenuTrigger = KDropdownMenu.Trigger;

export const DropdownMenuContent: Component<{ children: JSX.Element; class?: string }> = (props) => {
  return (
    <KDropdownMenu.Portal>
      <KDropdownMenu.Content class={cn(
        'z-50 min-w-[8rem] rounded-lg border border-border bg-background p-1 shadow-popover animate-in fade-in-0 zoom-in-95',
        props.class,
      )}>
        {props.children}
      </KDropdownMenu.Content>
    </KDropdownMenu.Portal>
  );
};

export const DropdownMenuItem: Component<{ children: JSX.Element; onSelect?: () => void; class?: string; disabled?: boolean }> = (props) => {
  return (
    <KDropdownMenu.Item
      onSelect={props.onSelect}
      disabled={props.disabled}
      class={cn(
        'flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-default outline-none hover:bg-surface-2 data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50',
        props.class,
      )}
    >
      {props.children}
    </KDropdownMenu.Item>
  );
};

export const DropdownMenuSeparator: Component = () => {
  return <KDropdownMenu.Separator class="h-px my-1 bg-border" />;
};
