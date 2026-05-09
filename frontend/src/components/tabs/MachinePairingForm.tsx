import { useState } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { deriveAuthKeyPair } from '@/lib/e2ee';

interface MachinePairingFormProps {
  connectionId: string;
  machineId: string;
  onPaired?: () => void;
}

export function MachinePairingForm({
  connectionId,
  machineId,
  onPaired,
}: MachinePairingFormProps) {
  const session = useConnectionStore(
    (s) =>
      s.nodes.find((n) => n.entry.id === connectionId)?.gatewayState?.session
  );
  const gatewayUrl = useConnectionStore(
    (s) => s.nodes.find((n) => n.entry.id === connectionId)?.gatewayUrl ?? ''
  );
  const pairMachine = useConnectionStore((s) => s.pairMachine);

  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    const trimmed = secret.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      if (!session) throw new Error('Not logged in');
      const secretBytes = Uint8Array.from(atob(trimmed), (c) =>
        c.charCodeAt(0)
      );
      const authKp = await deriveAuthKeyPair(secretBytes);
      const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

      const regResp = await fetch(`${gatewayUrl}/api/auth/device/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.sessionToken}`,
        },
        body: JSON.stringify({
          public_key: pubKeyB64,
          device_name: 'WebUI',
        }),
      });
      if (!regResp.ok && regResp.status !== 409) {
        const text = await regResp.text();
        throw new Error(
          `Device registration failed (${regResp.status}): ${text}`
        );
      }

      pairMachine(machineId, trimmed);
      setSecret('');
      onPaired?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-3 pb-3 pl-9 space-y-2">
      <input
        className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded"
        placeholder="Paste master secret from bridge terminal (base64)"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        disabled={loading}
      />
      <p className="text-xs text-foreground/40">
        Copy the master secret from the bridge terminal output.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        className="px-3 py-1 text-sm bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
        onClick={handlePair}
        disabled={!secret.trim() || loading}
      >
        {loading ? 'Registering...' : 'Pair'}
      </button>
    </div>
  );
}
