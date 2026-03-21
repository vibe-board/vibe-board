import { createSignal, createEffect, For, Show, onCleanup, type Component } from 'solid-js';
import { cn } from '@/lib/cn';
import { Search } from 'lucide-solid';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: Component;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
}

export const CommandPalette: Component<CommandPaletteProps> = (props) => {
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal(0);

  const filtered = () => {
    const q = query().toLowerCase();
    if (!q) return props.items;
    return props.items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.keywords?.some(k => k.toLowerCase().includes(q))
    );
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered().length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered()[selected()];
      if (item) { item.action(); props.onOpenChange(false); }
    }
    else if (e.key === 'Escape') { props.onOpenChange(false); }
  };

  createEffect(() => { if (props.open) { setQuery(''); setSelected(0); } });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => props.onOpenChange(false)}>
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <div class="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-popover" onClick={e => e.stopPropagation()}>
          <div class="flex items-center gap-2 border-b border-border px-3">
            <Search class="h-4 w-4 text-muted shrink-0" />
            <input
              autofocus
              class="h-11 w-full bg-transparent text-sm text-foreground placeholder:text-subtle outline-none"
              placeholder="Type a command..."
              value={query()}
              onInput={e => { setQuery(e.currentTarget.value); setSelected(0); }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div class="max-h-[300px] overflow-y-auto p-1">
            <For each={filtered()} fallback={<div class="px-3 py-6 text-center text-sm text-muted">No results found</div>}>
              {(item, index) => (
                <button
                  class={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    index() === selected() ? 'bg-surface-2 text-foreground' : 'text-muted hover:bg-surface-2 hover:text-foreground',
                  )}
                  onClick={() => { item.action(); props.onOpenChange(false); }}
                  onMouseEnter={() => setSelected(index())}
                >
                  <span class="font-medium">{item.label}</span>
                  <Show when={item.description}>
                    <span class="text-subtle text-xs">{item.description}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
};
