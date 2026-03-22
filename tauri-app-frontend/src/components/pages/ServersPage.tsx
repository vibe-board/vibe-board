import { useState } from 'react';
import { useConnectionStore } from '@/stores';
import { Card, Button, Input, Dialog, Badge, StatusDot } from '@/components/ui';
import { generateMasterSecret } from '@/lib/crypto';
import type { ServerConfig } from '@/types';

export function ServersPage() {
  const { servers, statuses, gatewayMachines, activeServerId, addServer, removeServer, setActiveServer, connectToServer, disconnectFromServer } = useConnectionStore();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'direct' | 'gateway'>('direct');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewayToken, setGatewayToken] = useState('');
  const [masterSecret, setMasterSecret] = useState('');

  function handleAdd() {
    if (!name.trim() || !url.trim()) return;
    const config: ServerConfig = {
      id: crypto.randomUUID(),
      name: name.trim(),
      url: url.trim(),
      mode,
      gatewayUrl: mode === 'gateway' ? gatewayUrl.trim() : undefined,
      gatewayToken: mode === 'gateway' ? gatewayToken.trim() : undefined,
      masterSecret: mode === 'gateway' ? masterSecret.trim() || undefined : undefined,
      isDefault: servers.length === 0,
    };
    addServer(config);
    resetForm();
  }

  function handleGenerateSecret() {
    setMasterSecret(generateMasterSecret());
  }

  function resetForm() {
    setName('');
    setUrl('');
    setMode('direct');
    setGatewayUrl('');
    setGatewayToken('');
    setMasterSecret('');
    setAddOpen(false);
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">Servers</h2>
          <p className="text-sm text-text-tertiary">{servers.length} servers configured</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <PlusIcon size={14} />
          Add Server
        </Button>
      </div>

      {servers.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-sm text-text-tertiary mb-3">No servers configured</p>
          <Button onClick={() => setAddOpen(true)}>Add your first server</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => {
            const status = statuses[server.id];
            const machines = gatewayMachines[server.id] ?? [];
            const isActive = activeServerId === server.id;
            return (
              <Card key={server.id} className={isActive ? 'border-accent/30' : ''}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <StatusDot status={status?.connected ? 'online' : 'offline'} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{server.name}</span>
                        {isActive && <Badge variant="info">Active</Badge>}
                        <Badge variant={server.mode === 'gateway' ? 'info' : 'muted'}>
                          {server.mode === 'gateway' ? 'E2EE Gateway' : 'Direct'}
                        </Badge>
                      </div>
                      <div className="text-xs text-text-tertiary mt-0.5">{server.url}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {status?.connected ? (
                      <Button variant="ghost" size="xs" onClick={() => disconnectFromServer(server.id)}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button variant="secondary" size="xs" onClick={() => connectToServer(server.id)}>
                        Connect
                      </Button>
                    )}
                    <Button variant="ghost" size="xs" onClick={() => setActiveServer(server.id)} disabled={isActive}>
                      Set Active
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => removeServer(server.id)} className="text-text-tertiary hover:text-error">
                      Remove
                    </Button>
                  </div>
                </div>

                {status?.latency && (
                  <div className="text-xs text-text-disabled mb-2">Latency: {status.latency}ms</div>
                )}
                {status?.error && (
                  <div className="text-xs text-error mb-2">{status.error}</div>
                )}

                {server.mode === 'gateway' && machines.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-xs text-text-disabled mb-2">Connected Machines</div>
                    <div className="space-y-1.5">
                      {machines.map((m) => (
                        <div key={m.machine_id} className="flex items-center gap-2 text-xs">
                          <StatusDot status={m.online ? 'online' : 'offline'} />
                          <span className="text-text-secondary">{m.hostname}</span>
                          <span className="text-text-disabled">({m.platform})</span>
                          <span className="text-text-disabled ml-auto">{m.machine_id.slice(0, 8)}...</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {server.mode === 'gateway' && server.gatewayUrl && (
                  <div className="mt-2 text-xs text-text-disabled">
                    Gateway: {server.gatewayUrl}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Server Dialog */}
      <Dialog open={addOpen} onClose={resetForm} title="Add Server" className="max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }} className="space-y-4">
          <Input
            label="Server Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Server"
            autoFocus
            required
          />
          <Input
            label="Server URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:9870"
            required
          />

          {/* Mode toggle */}
          <div>
            <label className="text-sm text-text-secondary font-medium mb-1.5 block">Connection Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('direct')}
                className={`flex-1 px-3 py-2 rounded border text-sm transition-colors ${
                  mode === 'direct'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-secondary hover:bg-bg-hover'
                }`}
              >
                <div className="font-medium">Direct</div>
                <div className="text-xs text-text-tertiary mt-0.5">Connect directly (LAN/localhost)</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('gateway')}
                className={`flex-1 px-3 py-2 rounded border text-sm transition-colors ${
                  mode === 'gateway'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-secondary hover:bg-bg-hover'
                }`}
              >
                <div className="font-medium">Gateway (E2EE)</div>
                <div className="text-xs text-text-tertiary mt-0.5">End-to-end encrypted via gateway</div>
              </button>
            </div>
          </div>

          {mode === 'gateway' && (
            <>
              <Input
                label="Gateway WebSocket URL"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="wss://gateway.vibeboard.dev"
              />
              <Input
                label="Session Token"
                value={gatewayToken}
                onChange={(e) => setGatewayToken(e.target.value)}
                placeholder="Gateway session token"
              />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-text-secondary font-medium">Master Secret (E2EE)</label>
                  <button
                    type="button"
                    onClick={handleGenerateSecret}
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    Generate New
                  </button>
                </div>
                <input
                  value={masterSecret}
                  onChange={(e) => setMasterSecret(e.target.value)}
                  placeholder="Base64-encoded master secret"
                  className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono placeholder:text-text-disabled focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <p className="text-[10px] text-text-disabled mt-1">
                  Used to derive encryption keys. Share this with your daemon to establish E2EE.
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit">Add Server</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
