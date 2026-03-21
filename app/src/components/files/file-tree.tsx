import { For, createResource, Show, type Component } from 'solid-js';
import { File, Folder } from 'lucide-solid';
import { filesystemApi } from '@/api/endpoints/filesystem';

interface FileTreeProps {
  basePath: string;
  onFileSelect: (path: string) => void;
}

export const FileTree: Component<FileTreeProps> = (props) => {
  const [entries] = createResource(
    () => props.basePath,
    (path) => filesystemApi.listDirectory(path),
  );

  return (
    <div class="text-xs">
      <Show
        when={entries()}
        fallback={<div class="p-2 text-muted">Loading...</div>}
      >
        {(data) => (
          <For each={data().entries}>
            {(entry) => (
              <button
                class="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-surface-2 rounded-md transition-colors text-left"
                onClick={() => props.onFileSelect(entry.path)}
              >
                {entry.is_directory ? (
                  <Folder class="h-3.5 w-3.5 text-accent shrink-0" />
                ) : (
                  <File class="h-3.5 w-3.5 text-muted shrink-0" />
                )}
                <span class="truncate text-foreground">{entry.name}</span>
              </button>
            )}
          </For>
        )}
      </Show>
    </div>
  );
};
