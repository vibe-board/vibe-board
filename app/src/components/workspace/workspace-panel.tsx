import { Show, type Component } from 'solid-js';
import type { Workspace } from '@/api/types';

export const WorkspacePanel: Component<{ workspace?: Workspace }> = (
  props,
) => {
  return (
    <Show
      when={props.workspace}
      fallback={<div class="p-4 text-sm text-muted">No workspace</div>}
    >
      {(ws) => (
        <div class="p-4 space-y-3">
          <h3 class="text-sm font-medium text-foreground">
            {ws().name ?? 'Workspace'}
          </h3>
          <div class="text-xs text-muted">Branch: {ws().branch}</div>
          <div class="text-xs text-muted">Mode: {ws().mode}</div>
        </div>
      )}
    </Show>
  );
};
