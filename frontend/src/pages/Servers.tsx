import { ServerList } from '@/components/servers/ServerList';
import { AddServerDialog } from '@/components/servers/AddServerDialog';
import { useServerManager } from '@/contexts/ServerManagerContext';
import { Button } from '@/components/ui/button';
import { Plus, AlertCircle } from 'lucide-react';

export function Servers({ errorMessage }: { errorMessage?: string | null }) {
  const { servers } = useServerManager();

  const handleAddServer = async () => {
    await AddServerDialog.show();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Servers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to a Vibe Board server to get started.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddServer}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Server
        </Button>
      </div>

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="text-center py-16">
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
