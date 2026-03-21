import { ServerList } from '@/components/servers/ServerList';
import { AddServerDialog } from '@/components/servers/AddServerDialog';
import { useServerManager } from '@/contexts/ServerManagerContext';
import { Button } from '@/components/ui/button';
import { Plus, Server } from 'lucide-react';

export function Servers({ errorMessage }: { errorMessage?: string | null }) {
  const { servers } = useServerManager();

  const handleAddServer = async () => {
    await AddServerDialog.show();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header — sticky with safe-area-inset-top */}
      <header className="shrink-0 border-b bg-background/80 px-4 pb-3 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Server className="h-4 w-4 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Servers</h1>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddServer}
            className="shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </header>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-sm bg-destructive/10 p-3 text-destructive text-xs"
            >
              {errorMessage}
            </div>
          )}

          {servers.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <p className="text-sm text-muted-foreground mb-1">
                No servers configured yet.
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Connect to a Vibe Board server to get started.
              </p>
              <Button variant="outline" onClick={handleAddServer}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Your First Server
              </Button>
            </div>
          ) : (
            <ServerList />
          )}
        </div>
      </div>
    </div>
  );
}
