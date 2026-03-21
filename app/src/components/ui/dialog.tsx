import { Dialog as KDialog } from '@kobalte/core/dialog';
import type { Component, JSX } from 'solid-js';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
}

export const Dialog: Component<DialogProps> = (props) => {
  return (
    <KDialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.children}
    </KDialog>
  );
};

export const DialogTrigger = KDialog.Trigger;

export const DialogContent: Component<{ children: JSX.Element; class?: string }> = (props) => {
  return (
    <KDialog.Portal>
      <KDialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0" />
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <KDialog.Content class={cn(
          'w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-popover data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-bottom-2 data-[expanded]:slide-in-from-bottom-2',
          props.class,
        )}>
          {props.children}
        </KDialog.Content>
      </div>
    </KDialog.Portal>
  );
};

export const DialogTitle: Component<{ children: JSX.Element; class?: string }> = (props) => {
  return <KDialog.Title class={cn('text-lg font-semibold text-foreground', props.class)}>{props.children}</KDialog.Title>;
};

export const DialogDescription: Component<{ children: JSX.Element; class?: string }> = (props) => {
  return <KDialog.Description class={cn('text-sm text-muted mt-1', props.class)}>{props.children}</KDialog.Description>;
};
