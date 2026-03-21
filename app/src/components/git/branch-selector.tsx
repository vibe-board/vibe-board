import { For, createSignal, type Component } from 'solid-js';
import { cn } from '@/lib/cn';
import { GitBranch as GitBranchIcon, Check } from 'lucide-solid';
import type { GitBranch } from '@/api/types';

interface BranchSelectorProps {
  branches: GitBranch[];
  currentBranch?: string;
  onSelect: (branch: string) => void;
}

export const BranchSelector: Component<BranchSelectorProps> = (props) => {
  const [search, setSearch] = createSignal('');

  const filtered = () =>
    props.branches.filter((b) =>
      b.name.toLowerCase().includes(search().toLowerCase()),
    );

  return (
    <div class="w-64">
      <input
        class="w-full px-3 py-2 text-sm border-b border-border bg-transparent text-foreground placeholder:text-subtle outline-none"
        placeholder="Filter branches..."
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
      />
      <div class="max-h-60 overflow-y-auto p-1">
        <For each={filtered()}>
          {(branch) => (
            <button
              class={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-surface-2',
                branch.name === props.currentBranch && 'text-accent',
              )}
              onClick={() => props.onSelect(branch.name)}
            >
              <GitBranchIcon class="h-3.5 w-3.5 shrink-0" />
              <span class="truncate">{branch.name}</span>
              {branch.name === props.currentBranch && (
                <Check class="h-3.5 w-3.5 ml-auto shrink-0" />
              )}
            </button>
          )}
        </For>
      </div>
    </div>
  );
};
