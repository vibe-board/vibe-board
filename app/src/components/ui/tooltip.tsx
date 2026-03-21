import { Tooltip as KTooltip } from '@kobalte/core/tooltip';
import type { Component, JSX } from 'solid-js';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: string;
  children: JSX.Element;
  class?: string;
}

export const Tooltip: Component<TooltipProps> = (props) => {
  return (
    <KTooltip>
      <KTooltip.Trigger as="div" class="inline-flex">
        {props.children}
      </KTooltip.Trigger>
      <KTooltip.Portal>
        <KTooltip.Content class={cn(
          'z-50 rounded-md bg-surface-3 px-2.5 py-1.5 text-xs text-foreground shadow-md animate-in fade-in-0 zoom-in-95',
          props.class,
        )}>
          <KTooltip.Arrow />
          {props.content}
        </KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip>
  );
};
