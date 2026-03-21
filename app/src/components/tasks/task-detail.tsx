import { createResource, Show, For, type Component } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { tasksApi } from '@/api/endpoints/tasks';
import { StatusDot, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatRelativeTime } from '@/lib/date';
import { statusLabels } from '@/lib/colors';
import { ArrowLeft, Play, MessageSquare, GitMerge } from 'lucide-solid';

export const TaskDetail: Component = () => {
  const params = useParams<{ id: string; taskId: string }>();
  const [task] = createResource(
    () => params.taskId,
    (id) => tasksApi.get(id),
  );
  const [relationships] = createResource(
    () => params.taskId,
    (id) => tasksApi.getRelationships(id),
  );

  return (
    <div class="h-full overflow-y-auto">
      <div class="max-w-3xl mx-auto p-6">
        <A
          href={`/projects/${params.id}`}
          class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4"
        >
          <ArrowLeft class="h-4 w-4" /> Back to board
        </A>

        <Show
          when={task()}
          fallback={<div class="text-sm text-muted">Loading...</div>}
        >
          {(t) => (
            <>
              <div class="flex items-start gap-3 mb-4">
                <StatusDot status={t().status} class="mt-1.5" />
                <div class="flex-1">
                  <h1 class="text-xl font-semibold text-foreground">
                    {t().title}
                  </h1>
                  <div class="flex items-center gap-2 mt-1 text-xs text-muted">
                    <span>{statusLabels[t().status]}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(t().created_at)}</span>
                  </div>
                </div>
              </div>

              <Show when={t().description}>
                <div class="prose prose-sm text-muted mb-6">
                  <p>{t().description}</p>
                </div>
              </Show>

              <Separator />

              <div class="flex gap-2 my-4">
                <Button size="sm">
                  <Play class="h-3.5 w-3.5" /> Start Agent
                </Button>
                <Button size="sm" variant="secondary">
                  <MessageSquare class="h-3.5 w-3.5" /> Follow Up
                </Button>
                <Button size="sm" variant="secondary">
                  <GitMerge class="h-3.5 w-3.5" /> Merge
                </Button>
              </div>

              <Separator />

              <Show when={relationships()}>
                {(rels) => (
                  <div class="mt-4 space-y-3">
                    <Show when={rels().children.length > 0}>
                      <div>
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">
                          Sub-tasks
                        </h3>
                        <For each={rels().children}>
                          {(child) => (
                            <A
                              href={`/projects/${params.id}/tasks/${child.id}`}
                              class="flex items-center gap-2 py-1.5 text-sm text-muted hover:text-foreground"
                            >
                              <StatusDot status={child.status} />
                              {child.title}
                            </A>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
    </div>
  );
};
