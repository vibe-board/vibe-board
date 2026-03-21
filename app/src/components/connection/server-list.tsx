import { For, Show, type Component } from 'solid-js';
import { useConnection } from '@/stores/connections';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Wifi, WifiOff, Trash2, Server, Plus } from 'lucide-solid';

interface ServerListProps {
  onAddServer: () => void;
}

export const ServerList: Component<ServerListProps> = (props) => {
  const { state, activeServer, setActiveServer, removeServer } = useConnection();

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-foreground">Servers</h3>
        <Button variant="ghost" size="sm" onClick={props.onAddServer}>
          <Plus class="h-3.5 w-3.5" />
          Add Server
        </Button>
      </div>

      <Show when={state.servers.length === 0}>
        <div class="flex flex-col items-center gap-3 py-12 text-center">
          <Server class="h-10 w-10 text-subtle" />
          <div>
            <p class="text-sm font-medium text-foreground">No servers configured</p>
            <p class="text-xs text-muted mt-1">Add a server to get started</p>
          </div>
          <Button size="sm" onClick={props.onAddServer}>
            <Plus class="h-3.5 w-3.5" />
            Add Server
          </Button>
        </div>
      </Show>

      <div class="space-y-1">
        <For each={state.servers}>
          {(server) => (
            <div
              class={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors',
                server.id === state.activeServerId ? 'bg-accent/10 border border-accent/20' : 'hover:bg-surface-2 border border-transparent',
              )}
              onClick={() => setActiveServer(server.id)}
            >
              {server.status === 'connected'
                ? <Wifi class="h-4 w-4 text-status-done shrink-0" />
                : <WifiOff class="h-4 w-4 text-subtle shrink-0" />
              }
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-foreground truncate">{server.name}</div>
                <div class="text-xs text-muted truncate">{server.url}</div>
              </div>
              <span class={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                server.type === 'direct' ? 'bg-surface-2 text-muted' : 'bg-accent/10 text-accent',
              )}>
                {server.type === 'direct' ? 'Direct' : 'E2EE'}
              </span>
              <button
                class="p-1 rounded hover:bg-surface-3 text-subtle hover:text-danger transition-colors"
                onClick={(e) => { e.stopPropagation(); removeServer(server.id); }}
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
