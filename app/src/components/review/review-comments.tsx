import { For, type Component } from 'solid-js';
import type { PrCommentsResponse } from '@/api/types';

type PrComment = PrCommentsResponse['comments'][number];

export const ReviewComments: Component<{ comments: PrComment[] }> = (
  props,
) => {
  return (
    <div class="space-y-3">
      <For each={props.comments}>
        {(comment) => (
          <div class="rounded-lg border border-border p-3">
            <div class="flex items-center gap-2 text-xs text-muted mb-1.5">
              <span class="font-medium text-foreground">{comment.author}</span>
              <span>{comment.created_at}</span>
            </div>
            <p class="text-sm text-foreground whitespace-pre-wrap">
              {comment.body}
            </p>
          </div>
        )}
      </For>
    </div>
  );
};
