import { Switch as KSwitch } from '@kobalte/core/switch';
import type { Component } from 'solid-js';
import { cn } from '@/lib/cn';

interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  class?: string;
}

export const Switch: Component<SwitchProps> = (props) => {
  return (
    <KSwitch class={cn('inline-flex items-center gap-2', props.class)} checked={props.checked} onChange={props.onChange}>
      <KSwitch.Input />
      <KSwitch.Control class="inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-2 transition-colors data-[checked]:bg-accent">
        <KSwitch.Thumb class="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-4 translate-x-0.5" />
      </KSwitch.Control>
      {props.label && <KSwitch.Label class="text-sm text-foreground">{props.label}</KSwitch.Label>}
    </KSwitch>
  );
};
