import { For, Show, type Component } from 'solid-js';
import { cn } from '@/lib/cn';
import type { Diff } from '@/api/types';

export const DiffView: Component<{ diffs: Diff[] }> = (props) => {
  return (
    <div class="space-y-3">
      <For each={props.diffs}>
        {(diff) => (
          <div class="rounded-lg border border-border overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-2 text-xs">
              <span
                class={cn(
                  'font-medium',
                  diff.change === 'added'
                    ? 'text-status-done'
                    : diff.change === 'deleted'
                      ? 'text-danger'
                      : 'text-foreground',
                )}
              >
                {diff.newPath ?? diff.oldPath}
              </span>
              <span class="text-subtle">{diff.change}</span>
            </div>
            <Show when={diff.newContent || diff.oldContent}>
              <pre class="p-3 text-xs font-mono text-foreground overflow-x-auto">
                {diff.newContent ?? diff.oldContent}
              </pre>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
};
