import { For, type Component } from 'solid-js';
import { A } from '@solidjs/router';
import type { Project } from '@/api/types';
import { FolderKanban } from 'lucide-solid';
import { formatRelativeTime } from '@/lib/date';

export const ProjectList: Component<{ projects: Project[] }> = (props) => {
  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <For each={props.projects}>
        {(project) => (
          <A
            href={`/projects/${project.id}`}
            class="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors"
          >
            <div class="flex items-center gap-2 mb-2">
              <FolderKanban class="h-5 w-5 text-accent" />
              <h3 class="text-sm font-semibold text-foreground">
                {project.name}
              </h3>
            </div>
            <div class="text-xs text-muted">
              {formatRelativeTime(project.updated_at.toString())}
            </div>
          </A>
        )}
      </For>
    </div>
  );
};
