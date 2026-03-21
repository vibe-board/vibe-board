import { Show, type Component } from 'solid-js';
import { useConnection } from '@/stores/connections';
import { A } from '@solidjs/router';
import { Server, Plus, ArrowRight, LayoutDashboard } from 'lucide-solid';
import { Button } from '@/components/ui/button';

const HomePage: Component = () => {
  const { state, activeServer } = useConnection();

  return (
    <div class="h-full flex items-center justify-center p-8">
      <div class="max-w-md w-full text-center space-y-6">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-2">
          <LayoutDashboard class="h-8 w-8 text-accent" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-foreground">Vibe Board</h1>
          <p class="text-sm text-muted mt-2">AI-powered task orchestration for your codebase</p>
        </div>

        <Show when={state.servers.length > 0} fallback={
          <div class="space-y-3">
            <p class="text-sm text-muted">Get started by connecting to a Vibe Board server.</p>
            <A href="/connect">
              <Button>
                <Plus class="h-4 w-4" /> Add Server
              </Button>
            </A>
          </div>
        }>
          <div class="space-y-3">
            <Show when={activeServer()}>
              <div class="rounded-xl border border-border bg-surface p-4">
                <div class="flex items-center gap-3">
                  <Server class="h-5 w-5 text-accent" />
                  <div class="flex-1 text-left">
                    <div class="text-sm font-medium text-foreground">{activeServer()!.name}</div>
                    <div class="text-xs text-muted">{activeServer()!.url}</div>
                  </div>
                  <A href="/projects">
                    <Button size="sm" variant="ghost">
                      Open <ArrowRight class="h-3.5 w-3.5" />
                    </Button>
                  </A>
                </div>
              </div>
            </Show>
            <A href="/projects">
              <Button class="w-full">
                <ArrowRight class="h-4 w-4" /> Go to Projects
              </Button>
            </A>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default HomePage;
