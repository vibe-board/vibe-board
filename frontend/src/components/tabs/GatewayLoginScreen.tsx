// frontend/src/components/tabs/GatewayLoginScreen.tsx
import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';
import type { GatewayNode } from '@/lib/connections/gatewayNode';

export function GatewayLoginScreen({ gwNode }: { gwNode: GatewayNode }) {
  const { loginConnection, signupConnection } = useConnectionStore();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Force re-render when gwNode internal state changes
  const [, force] = useState(0);
  useEffect(() => gwNode.onChange(() => force((t) => t + 1)), [gwNode]);

  // Refresh registration-status on mount
  useEffect(() => {
    gwNode.fetchRegistrationStatus();
  }, [gwNode]);

  const { registrationOpen, authError, authLoading } = gwNode;

  const handleSubmit = useCallback(async () => {
    if (isSignup) {
      await signupConnection(
        gwNode.connectionId,
        email,
        password,
        name || undefined
      );
    } else {
      await loginConnection(gwNode.connectionId, email, password);
    }
  }, [
    isSignup,
    signupConnection,
    loginConnection,
    gwNode.connectionId,
    email,
    password,
    name,
  ]);

  return (
    <div className="flex items-center justify-center h-screen bg-background px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Vibe Board</h1>
          <p className="text-sm text-foreground/50">
            {isSignup ? 'Create an account' : 'Sign in to continue'}
          </p>
        </div>

        <div className="space-y-2">
          {isSignup && (
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
        </div>

        {authError && <p className="text-sm text-destructive">{authError}</p>}

        <button
          className="w-full px-3 py-2 text-sm bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50 flex items-center justify-center gap-2"
          onClick={handleSubmit}
          disabled={authLoading || !email || !password}
        >
          {authLoading && <Loader2 size={14} className="animate-spin" />}
          {isSignup ? 'Sign up' : 'Log in'}
        </button>

        {registrationOpen && (
          <p className="text-center text-sm text-foreground/50">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              className="text-foreground underline hover:opacity-80"
              onClick={() => setIsSignup(!isSignup)}
            >
              {isSignup ? 'Log in' : 'Sign up'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
