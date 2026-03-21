import { useServerManager } from '@/contexts/ServerManagerContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ServerStatusIndicator() {
  const { connectionStatus, servers, activeServerId } = useServerManager();
  const activeServer = servers.find((s) => s.id === activeServerId);

  const color =
    connectionStatus === 'connected'
      ? 'bg-green-500'
      : connectionStatus === 'connecting'
        ? 'bg-yellow-500 animate-pulse'
        : connectionStatus === 'error'
          ? 'bg-red-500'
          : 'bg-muted-foreground/40';

  const label = activeServer
    ? `${activeServer.name} (${connectionStatus})`
    : 'Not connected';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
            aria-label={label}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span className="text-xs">{label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
