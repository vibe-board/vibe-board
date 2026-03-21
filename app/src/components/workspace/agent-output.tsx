import type { Component } from 'solid-js';

export const AgentOutput: Component<{ content: string }> = (props) => {
  return (
    <div class="p-3 rounded-lg bg-surface-2 border border-border">
      <pre class="text-xs text-foreground whitespace-pre-wrap font-mono">
        {props.content}
      </pre>
    </div>
  );
};
