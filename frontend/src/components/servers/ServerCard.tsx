import type { ServerConfig, ServerConnectionStatus } from '@/lib/servers/types';
import { getServerAddress } from '@/lib/servers/types';
import { useServerManager } from '@/contexts/ServerManagerContext';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/dialogs/shared/ConfirmDialog';
import { Plug, Unplug, Trash2, Server, Cloud } from 'lucide-react';

interface ServerCardProps {
  config: ServerConfig;
  isActive: boolean;
  connectionStatus: ServerConnectionStatus;
}

export function ServerCard({
  config,
  isActive,
  connectionStatus,
}: ServerCardProps) {
  const { connectToServer, disconnectFromServer, removeServer } =
    useServerManager();

  const handleConnect = () => {
    connectToServer(config.id);
  };

  const handleDisconnect = () => {
    disconnectFromServer();
  };

  const handleDelete = async () => {
    const result = await ConfirmDialog.show({
      title: 'Remove Server',
      message: `Remove "${config.name}" from your server list? This won't affect the server itself.`,
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (result === 'confirmed') {
      await removeServer(config.id);
    }
  };

  const address = getServerAddress(config);

  const statusColor =
    connectionStatus === 'connected'
      ? 'bg-green-500'
      : connectionStatus === 'connecting'
        ? 'bg-yellow-500 animate-pulse'
        : connectionStatus === 'error'
          ? 'bg-red-500'
          : 'bg-muted-foreground/30';

  return (
    <div className="flex items-center gap-3 rounded-md border bg-background p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
        {config.type === 'direct' ? (
          <Server className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Cloud className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">
            {config.name}
          </span>
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${statusColor}`}
            title={connectionStatus}
          />
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {config.type === 'direct' ? 'Direct' : 'E2EE'} &middot; {address}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isActive && connectionStatus === 'connected' ? (
          <Button variant="ghost" size="xs" onClick={handleDisconnect}>
            <Unplug className="h-3.5 w-3.5 mr-1" />
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="xs"
            onClick={handleConnect}
            disabled={connectionStatus === 'connecting'}
          >
            <Plug className="h-3.5 w-3.5 mr-1" />
            Connect
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
