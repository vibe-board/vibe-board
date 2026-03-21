import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Server, Trash2, Globe, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConnectionStore } from '@/lib/store/connectionStore';
import { AddServerDialog } from '@/components/connection/AddServerDialog';

export function DashboardPage() {
  const navigate = useNavigate();
  const { servers, gateways, removeServer, removeGateway, setActiveServer } =
    useConnectionStore();
  const [addServerOpen, setAddServerOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          Manage your server connections and gateways.
        </p>
      </div>

      {/* Servers */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">Servers</h2>
          <Button size="sm" onClick={() => setAddServerOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Add Server
          </Button>
        </div>

        {servers.length === 0 ? (
          <Card className="flex items-center justify-center border-dashed p-8">
            <div className="text-center">
              <Server className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
              <p className="text-sm text-text-tertiary">No servers configured</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setAddServerOpen(true)}
              >
                Add your first server
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-2">
            {servers.map((server) => (
              <Card
                key={server.id}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-overlay">
                    {server.type === 'direct' ? (
                      <Globe className="h-4 w-4 text-text-secondary" />
                    ) : (
                      <Shield className="h-4 w-4 text-accent" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-text-primary">
                      {server.name}
                    </span>
                    <p className="text-xs text-text-tertiary">{server.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={server.type === 'direct' ? 'secondary' : 'default'}>
                    {server.type === 'direct' ? 'Direct' : 'E2EE'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setActiveServer(server.id);
                      navigate(`/servers/${server.id}/projects`);
                    }}
                  >
                    <Server className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-text-tertiary hover:text-red-400"
                    onClick={() => removeServer(server.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Gateways */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">
            E2EE Gateways
          </h2>
        </div>

        {gateways.length === 0 ? (
          <Card className="flex items-center justify-center border-dashed p-8">
            <div className="text-center">
              <Shield className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
              <p className="text-sm text-text-tertiary">
                No gateways configured
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-2">
            {gateways.map((gateway) => (
              <Card
                key={gateway.id}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-accent/20">
                    <Shield className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-text-primary">
                      {gateway.name}
                    </span>
                    <p className="text-xs text-text-tertiary">{gateway.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-text-tertiary hover:text-red-400"
                    onClick={() => removeGateway(gateway.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddServerDialog open={addServerOpen} onOpenChange={setAddServerOpen} />
    </div>
  );
}
