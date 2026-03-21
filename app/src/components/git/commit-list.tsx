import { For, type Component } from 'solid-js';
import { formatRelativeTime } from '@/lib/date';
import type { CommitInfo } from '@/api/types';
import { GitCommit } from 'lucide-solid';

export const CommitList: Component<{ commits: CommitInfo[] }> = (props) => {
  return (
    <div class="space-y-0.5">
      <For each={props.commits}>
        {(commit) => (
          <div class="flex items-start gap-2.5 px-3 py-2 hover:bg-surface-2 rounded-md transition-colors">
            <GitCommit class="h-4 w-4 text-muted mt-0.5 shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="text-sm text-foreground truncate">
                {commit.message.split('\n')[0]}
              </div>
              <div class="flex items-center gap-2 text-[10px] text-subtle mt-0.5">
                <span>{commit.sha.slice(0, 7)}</span>
                <span>{commit.author}</span>
                <span>
                  {formatRelativeTime(commit.timestamp.toString())}
                </span>
                <span class="text-status-done">+{commit.additions}</span>
                <span class="text-danger">-{commit.deletions}</span>
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};
