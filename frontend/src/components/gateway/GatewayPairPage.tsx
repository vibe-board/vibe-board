import { useState } from 'react';
import { useGateway } from '@/contexts/GatewayContext';

export function GatewayPairPage() {
  const { addPairedSecret, pairError, logout } = useGateway();
  const [secretInput, setSecretInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (secretInput.trim()) {
      addPairedSecret(secretInput.trim());
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold text-foreground">Pair Device</h1>
        <p className="text-sm opacity-70">
          Enter the master secret from your vibe-kanban server.
        </p>
        <div className="gateway-code-block">
          Run <code>vibe-kanban login --gateway {window.location.origin}</code>{' '}
          on your server to get the master secret.
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="secret" className="block text-sm font-medium">
            Master Secret (base64)
          </label>
          <input
            id="secret"
            type="text"
            required
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            className="gateway-input font-mono"
            placeholder="Paste your 32-byte base64 master secret..."
          />
        </div>

        {pairError && (
          <div className="gateway-error">
            <p className="text-sm">{pairError}</p>
          </div>
        )}

        <button type="submit" className="gateway-button-primary">
          Pair
        </button>
      </form>

      {/* Sign out */}
      <p className="text-center text-sm opacity-70">
        <button type="button" onClick={logout} className="gateway-link">
          Sign out
        </button>
      </p>
    </div>
  );
}
