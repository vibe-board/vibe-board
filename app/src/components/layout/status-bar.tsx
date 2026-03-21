import { Show, type Component } from 'solid-js';
import { useConnection } from '@/stores/connections';

export const StatusBar: Component = () => {
  const { activeServer } = useConnection();

  return (
    <footer class="flex items-center justify-between h-6 px-3 border-t border-border bg-surface text-[10px] text-subtle shrink-0">
      <div class="flex items-center gap-3">
        <Show when={activeServer()}>
          <span>{activeServer()!.type === 'direct' ? 'Direct' : 'E2EE Gateway'}</span>
          <span class="text-border">|</span>
          <span>{activeServer()!.url}</span>
        </Show>
      </div>
      <span>Vibe Board v0.1.0</span>
    </footer>
  );
};
