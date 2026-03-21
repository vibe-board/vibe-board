import type { Component } from 'solid-js';
import type { Session } from '@/api/types';

export const SessionView: Component<{ session: Session }> = (props) => {
  return (
    <div class="p-3 rounded-lg border border-border bg-surface">
      <div class="text-sm font-medium text-foreground">
        {props.session.executor ?? 'Unknown Agent'}
      </div>
      <div class="text-xs text-muted mt-1">
        Session {props.session.id.slice(0, 8)}
      </div>
    </div>
  );
};
