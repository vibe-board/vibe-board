import { ServerList } from '@/components/servers/ServerList';
import { AddServerDialog } from '@/components/servers/AddServerDialog';
import { useServerManager } from '@/contexts/ServerManagerContext';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function Servers({ errorMessage }: { errorMessage?: string | null }) {
  const { servers } = useServerManager();

  const handleAddServer = async () => {
    await AddServerDialog.show();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:py-8 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-foreground">
            Servers
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            Connect to a Vibe Board server to get started.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddServer}
          className="shrink-0 ml-2"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Server
        </Button>
      </div>

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
          <p className="text-muted-foreground mb-4">
            No servers configured yet.
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
  );
}
