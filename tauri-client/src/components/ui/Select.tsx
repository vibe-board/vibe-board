import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function Select({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className,
  disabled = false,
}: SelectProps) {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={cn('relative', className)}>
        <ListboxButton
          className={cn(
            'min-h-[44px] w-full flex items-center justify-between',
            'rounded-md border border-input bg-background px-3 py-2',
            'text-sm text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className={cn(!selectedOption && 'text-muted-foreground')}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </ListboxButton>
        <ListboxOptions
          className={cn(
            'absolute z-50 mt-1 w-full rounded-md border border-input bg-background shadow-lg',
            'max-h-60 overflow-auto focus:outline-none',
          )}
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className={cn(
                'min-h-[44px] flex items-center justify-between px-3 py-2',
                'cursor-pointer text-sm text-foreground',
                'hover:bg-accent hover:text-accent-foreground',
                'data-[selected]:bg-primary/10',
              )}
            >
              {({ selected }) => (
                <>
                  <span>{option.label}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

export { Select };
export type { SelectOption };
