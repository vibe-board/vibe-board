import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GatewayPairProps {
  onPair: (secret: string) => void;
  onCancel: () => void;
}

export const GatewayPair: Component<GatewayPairProps> = (props) => {
  const [secret, setSecret] = createSignal('');

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-foreground">Pair Device</h3>
      <p class="text-sm text-muted">Enter the master secret from your CLI to pair this device.</p>
      <Input label="Master Secret" placeholder="Base64 encoded secret" value={secret()} onInput={e => setSecret(e.currentTarget.value)} />
      <div class="flex gap-2 justify-end pt-2">
        <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
        <Button onClick={() => props.onPair(secret())}>Pair</Button>
      </div>
    </div>
  );
};
