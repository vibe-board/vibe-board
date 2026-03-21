import { For, type Component } from 'solid-js';
import type { Repo } from '@/api/types';

export const RepoConfig: Component<{ repos: Repo[] }> = (props) => {
  return (
    <div class="space-y-2">
      <For each={props.repos}>
        {(repo) => (
          <div class="flex items-center gap-3 rounded-lg border border-border p-3">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-foreground truncate">
                {repo.display_name}
              </div>
              <div class="text-xs text-muted truncate">{repo.path}</div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};
