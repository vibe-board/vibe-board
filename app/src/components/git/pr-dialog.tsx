import type { Component } from 'solid-js';
import { Button } from '@/components/ui/button';

export const PrDialog: Component<{ onClose: () => void }> = (props) => {
  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-foreground">Pull Request</h3>
      <p class="text-sm text-muted">
        PR management will be available when connected to a server.
      </p>
      <div class="flex justify-end">
        <Button variant="ghost" onClick={props.onClose}>
          Close
        </Button>
      </div>
    </div>
  );
};
