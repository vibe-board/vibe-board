import type { Component } from 'solid-js';

export const ReposSettings: Component = () => {
  return (
    <div class="max-w-lg">
      <h2 class="text-lg font-semibold text-foreground mb-4">Repositories</h2>
      <p class="text-sm text-muted">
        Repository settings are managed per-project on the connected server.
      </p>
    </div>
  );
};
