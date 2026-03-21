import { Show, type Component } from 'solid-js';
import { useConnection } from '@/stores/connections';
import { cn } from '@/lib/cn';
import { Wifi, WifiOff, Loader2 } from 'lucide-solid';

export const ConnectionStatus: Component = () => {
  const { activeServer } = useConnection();

  const statusColor = () => {
    switch (activeServer()?.status) {
      case 'connected': return 'text-status-done';
      case 'connecting': return 'text-status-inprogress';
      case 'error': return 'text-danger';
      default: return 'text-subtle';
    }
  };

  return (
    <div class={cn('flex items-center gap-1.5 text-xs', statusColor())}>
      <Show when={activeServer()?.status === 'connecting'} fallback={
        <Show when={activeServer()?.status === 'connected'} fallback={<WifiOff class="h-3.5 w-3.5" />}>
          <Wifi class="h-3.5 w-3.5" />
        </Show>
      }>
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
      </Show>
    </div>
  );
};
