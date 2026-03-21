import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Globe, Shield } from 'lucide-react';
import { useConnectionStore } from '@/lib/store/connectionStore';

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold text-text-primary">Settings</h1>
      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>
        <TabsContent value="connections">
          <ConnectionSettings />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionSettings() {
  const { servers, gateways, removeServer, removeGateway, addServer } =
    useConnectionStore();
  const [serverName, setServerName] = useState('');
  const [serverUrl, setServerUrl] = useState('');

  const handleAddServer = () => {
    if (!serverName.trim() || !serverUrl.trim()) return;
    addServer({
      id: crypto.randomUUID(),
      name: serverName.trim(),
      url: serverUrl.trim(),
      type: 'direct',
    });
    setServerName('');
    setServerUrl('');
  };

  return (
    <div className="space-y-6 py-4">
      <div>
        <h3 className="mb-3 text-sm font-medium text-text-primary">Servers</h3>
        <div className="mb-3 flex gap-2">
          <Input
            placeholder="Server name"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
          />
          <Input
            placeholder="URL (e.g., http://localhost:3000)"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
          <Button onClick={handleAddServer}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {servers.map((server) => (
          <Card key={server.id} className="mb-2 flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-text-secondary" />
              <span className="text-sm">{server.name}</span>
              <span className="text-xs text-text-tertiary">{server.url}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-tertiary hover:text-red-400"
              onClick={() => removeServer(server.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Card>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-text-primary">
          E2EE Gateways
        </h3>
        {gateways.length === 0 ? (
          <p className="text-sm text-text-tertiary">No gateways configured</p>
        ) : (
          gateways.map((gateway) => (
            <Card
              key={gateway.id}
              className="mb-2 flex items-center justify-between p-3"
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-accent" />
                <span className="text-sm">{gateway.name}</span>
                <span className="text-xs text-text-tertiary">
                  {gateway.url}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-text-tertiary hover:text-red-400"
                onClick={() => removeGateway(gateway.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function AppearanceSettings() {
  return (
    <div className="py-4">
      <p className="text-sm text-text-secondary">
        Theme customization coming soon.
      </p>
    </div>
  );
}
