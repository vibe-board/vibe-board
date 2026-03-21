import type { Component } from 'solid-js';

export const FileViewer: Component<{
  content: string;
  filename: string;
}> = (props) => {
  return (
    <div class="h-full overflow-auto">
      <div class="px-3 py-1.5 border-b border-border bg-surface text-xs text-muted">
        {props.filename}
      </div>
      <pre class="p-3 text-xs font-mono text-foreground leading-relaxed whitespace-pre">
        {props.content}
      </pre>
    </div>
  );
};
