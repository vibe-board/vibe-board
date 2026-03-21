import { Select as KSelect } from '@kobalte/core/select';
import { For, type Component } from 'solid-js';
import { cn } from '@/lib/cn';
import { ChevronDown, Check } from 'lucide-solid';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  class?: string;
}

export const Select: Component<SelectProps> = (props) => {
  return (
    <KSelect
      options={props.options}
      optionValue="value"
      optionTextValue="label"
      value={props.options.find(o => o.value === props.value)}
      onChange={(opt) => opt && props.onChange?.(opt.value)}
      itemComponent={(itemProps) => (
        <KSelect.Item item={itemProps.item} class="flex items-center justify-between px-2 py-1.5 text-sm rounded-md cursor-default hover:bg-surface-2 outline-none data-[highlighted]:bg-surface-2">
          <KSelect.ItemLabel>{itemProps.item.rawValue.label}</KSelect.ItemLabel>
          <KSelect.ItemIndicator>
            <Check class="h-3.5 w-3.5 text-accent" />
          </KSelect.ItemIndicator>
        </KSelect.Item>
      )}
    >
      <KSelect.Trigger class={cn(
        'inline-flex items-center justify-between h-8 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground hover:bg-surface-2 transition-colors focus:outline-none focus:border-accent',
        props.class,
      )}>
        <KSelect.Value<SelectOption>>{(state) => state.selectedOption()?.label ?? props.placeholder ?? 'Select...'}</KSelect.Value>
        <KSelect.Icon>
          <ChevronDown class="h-3.5 w-3.5 text-muted" />
        </KSelect.Icon>
      </KSelect.Trigger>
      <KSelect.Portal>
        <KSelect.Content class="z-50 min-w-[8rem] rounded-lg border border-border bg-background p-1 shadow-popover animate-in fade-in-0 zoom-in-95">
          <KSelect.Listbox />
        </KSelect.Content>
      </KSelect.Portal>
    </KSelect>
  );
};
