import { useServerManager } from '@/contexts/ServerManagerContext';
import { ServerCard } from './ServerCard';

export function ServerList() {
  const { servers, activeServerId, connectionStatus } = useServerManager();

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <ServerCard
          key={server.id}
          config={server}
          isActive={server.id === activeServerId}
          connectionStatus={
            server.id === activeServerId ? connectionStatus : 'disconnected'
          }
        />
      ))}
    </div>
  );
}
