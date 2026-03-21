import { For, type Component } from 'solid-js';
import { Badge } from '@/components/ui/badge';
import { Bot } from 'lucide-solid';

interface AgentInfo {
  name: string;
  type: string;
  variant?: string;
}

export const AgentList: Component<{ agents: AgentInfo[] }> = (props) => {
  return (
    <div class="space-y-1">
      <For each={props.agents}>
        {(agent) => (
          <div class="flex items-center gap-3 rounded-lg p-3 hover:bg-surface-2 transition-colors">
            <Bot class="h-5 w-5 text-accent shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-foreground">
                {agent.name}
              </div>
              <div class="text-xs text-muted">{agent.type}</div>
            </div>
            {agent.variant && <Badge variant="muted">{agent.variant}</Badge>}
          </div>
        )}
      </For>
    </div>
  );
};
