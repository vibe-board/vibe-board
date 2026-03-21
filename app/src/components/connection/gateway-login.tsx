import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GatewayLoginProps {
  gatewayUrl: string;
  onLogin: (email: string, password: string) => void;
  onCancel: () => void;
}

export const GatewayLogin: Component<GatewayLoginProps> = (props) => {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-foreground">Gateway Login</h3>
      <p class="text-sm text-muted">Authenticate with {props.gatewayUrl}</p>
      <Input label="Email" type="email" value={email()} onInput={e => setEmail(e.currentTarget.value)} />
      <Input label="Password" type="password" value={password()} onInput={e => setPassword(e.currentTarget.value)} />
      <div class="flex gap-2 justify-end pt-2">
        <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
        <Button onClick={() => props.onLogin(email(), password())}>Login</Button>
      </div>
    </div>
  );
};
