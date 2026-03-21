import type { Component } from 'solid-js';

export const AgentsSettings: Component = () => {
  return (
    <div class="max-w-lg">
      <h2 class="text-lg font-semibold text-foreground mb-4">Agents</h2>
      <p class="text-sm text-muted">
        Agent profiles are loaded from the connected server.
      </p>
    </div>
  );
};
