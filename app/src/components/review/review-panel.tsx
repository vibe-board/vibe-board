import type { Component } from 'solid-js';

export const ReviewPanel: Component = () => {
  return (
    <div class="p-4">
      <h3 class="text-sm font-medium text-foreground mb-2">Code Review</h3>
      <p class="text-xs text-muted">
        Start a review to see AI-generated feedback on your changes.
      </p>
    </div>
  );
};
