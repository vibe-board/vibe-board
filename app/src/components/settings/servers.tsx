import type { Component } from 'solid-js';
import { ServerList } from '@/components/connection/server-list';

export const ServersSettings: Component = () => {
  return (
    <div class="max-w-lg">
      <h2 class="text-lg font-semibold text-foreground mb-4">Servers</h2>
      <ServerList onAddServer={() => {}} />
    </div>
  );
};
