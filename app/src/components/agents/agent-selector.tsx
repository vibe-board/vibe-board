import { For, type Component } from 'solid-js';
import { cn } from '@/lib/cn';
import { Bot, Check } from 'lucide-solid';

interface AgentOption {
  id: string;
  name: string;
  type: string;
}

export const AgentSelector: Component<{
  agents: AgentOption[];
  selected?: string;
  onSelect: (id: string) => void;
}> = (props) => {
  return (
    <div class="space-y-0.5">
      <For each={props.agents}>
        {(agent) => (
          <button
            class={cn(
              'flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-surface-2 transition-colors',
              agent.id === props.selected && 'bg-accent/10 text-accent',
            )}
            onClick={() => props.onSelect(agent.id)}
          >
            <Bot class="h-4 w-4 shrink-0" />
            <span class="flex-1 text-left truncate">{agent.name}</span>
            {agent.id === props.selected && (
              <Check class="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </For>
    </div>
  );
};
