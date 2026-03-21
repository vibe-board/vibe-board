import { createSignal, type Component } from 'solid-js';
import { useConnection, type ServerConnection } from '@/stores/connections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/toast';

interface AddServerProps {
  onClose: () => void;
}

export const AddServer: Component<AddServerProps> = (props) => {
  const { addServer, testConnection } = useConnection();
  const [name, setName] = createSignal('');
  const [url, setUrl] = createSignal('');
  const [type, setType] = createSignal<'direct' | 'gateway'>('direct');
  const [gatewayUrl, setGatewayUrl] = createSignal('');
  const [masterSecret, setMasterSecret] = createSignal('');
  const [testing, setTesting] = createSignal(false);

  const handleSubmit = async () => {
    if (!name() || !url()) return;

    setTesting(true);
    const healthy = await testConnection(url());
    setTesting(false);

    const server: Omit<ServerConnection, 'status'> = {
      id: crypto.randomUUID(),
      name: name(),
      type: type(),
      url: url(),
      gatewayUrl: type() === 'gateway' ? gatewayUrl() : undefined,
      masterSecret: type() === 'gateway' ? masterSecret() : undefined,
    };

    addServer(server);
    showToast(healthy ? 'Server added and connected' : 'Server added (offline)', healthy ? 'success' : 'info');
    props.onClose();
  };

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-foreground">Add Server</h3>

      <div class="flex gap-2">
        <button
          class={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${type() === 'direct' ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-foreground'}`}
          onClick={() => setType('direct')}
        >
          Direct Connection
        </button>
        <button
          class={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${type() === 'gateway' ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-foreground'}`}
          onClick={() => setType('gateway')}
        >
          E2EE Gateway
        </button>
      </div>

      <Input label="Server Name" placeholder="My Server" value={name()} onInput={e => setName(e.currentTarget.value)} />
      <Input label="Server URL" placeholder="http://localhost:3001" value={url()} onInput={e => setUrl(e.currentTarget.value)} />

      {type() === 'gateway' && (
        <>
          <Input label="Gateway URL" placeholder="wss://gateway.example.com" value={gatewayUrl()} onInput={e => setGatewayUrl(e.currentTarget.value)} />
          <Input label="Master Secret" placeholder="Base64 encoded secret" type="password" value={masterSecret()} onInput={e => setMasterSecret(e.currentTarget.value)} />
        </>
      )}

      <div class="flex gap-2 justify-end pt-2">
        <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
        <Button loading={testing()} onClick={handleSubmit}>Add Server</Button>
      </div>
    </div>
  );
};
