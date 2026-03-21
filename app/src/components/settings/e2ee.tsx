import type { Component } from 'solid-js';

export const E2eeSettings: Component = () => {
  return (
    <div class="max-w-lg">
      <h2 class="text-lg font-semibold text-foreground mb-4">
        End-to-End Encryption
      </h2>
      <p class="text-sm text-muted">
        Manage E2EE keys and gateway connections.
      </p>
    </div>
  );
};
