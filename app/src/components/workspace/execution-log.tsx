import { For, type Component } from 'solid-js';
import type { PatchType } from '@/api/types';

export const ExecutionLog: Component<{ patches: PatchType[] }> = (props) => {
  return (
    <div class="font-mono text-xs leading-relaxed p-3 bg-background rounded-lg border border-border overflow-auto max-h-[500px]">
      <For each={props.patches}>
        {(patch) => (
          <div class="py-0.5">
            {patch.type === 'STDOUT' && (
              <span class="text-foreground">{patch.content}</span>
            )}
            {patch.type === 'STDERR' && (
              <span class="text-danger">{patch.content}</span>
            )}
            {patch.type === 'NORMALIZED_ENTRY' && (
              <span class="text-muted">{patch.content.content}</span>
            )}
          </div>
        )}
      </For>
    </div>
  );
};
