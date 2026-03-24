import { useState, useCallback } from 'react';
import { useGateway } from '@/contexts/GatewayContext';
import { QRScanner } from '@/components/ui/qr-scanner';
import type { MachineStatus } from '@/lib/e2ee';

export function GatewayMachineSelectPage() {
  const {
    machines,
    selectMachine,
    connectionError,
    logout,
    pairMachine,
    unpairMachine,
    isMachinePaired,
    pairError,
  } = useGateway();

  // Track which machine card has the pair form open
  const [pairingMachineId, setPairingMachineId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground">Machines</h1>
        <button type="button" onClick={logout} className="gateway-link text-sm">
          Sign out
        </button>
      </div>

      {connectionError && (
        <div className="gateway-error text-center">
          <p className="text-sm">{connectionError}</p>
        </div>
      )}

      {machines.length === 0 ? (
        <div className="py-8 space-y-3">
          <p className="text-sm opacity-60 text-center">No machines online.</p>
          <div className="gateway-code-block">
            Run <code>vibe-board login --gateway {window.location.origin}</code>{' '}
            on your server to connect it.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {machines.map((m) => (
            <MachineCard
              key={m.machine_id}
              machine={m}
              paired={isMachinePaired(m.machine_id)}
              isPairingOpen={pairingMachineId === m.machine_id}
              onOpenPairing={() => setPairingMachineId(m.machine_id)}
              onClosePairing={() => setPairingMachineId(null)}
              onPair={(secret) => {
                pairMachine(m.machine_id, secret);
                setPairingMachineId(null);
              }}
              onUnpair={() => unpairMachine(m.machine_id)}
              onConnect={() => selectMachine(m.machine_id)}
              pairError={pairingMachineId === m.machine_id ? pairError : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface MachineCardProps {
  machine: MachineStatus;
  paired: boolean;
  isPairingOpen: boolean;
  onOpenPairing: () => void;
  onClosePairing: () => void;
  onPair: (secret: string) => void;
  onUnpair: () => void;
  onConnect: () => void;
  pairError: string | null;
}

function MachineCard({
  machine,
  paired,
  isPairingOpen,
  onOpenPairing,
  onClosePairing,
  onPair,
  onUnpair,
  onConnect,
  pairError,
}: MachineCardProps) {
  const [secretInput, setSecretInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const handlePairSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (secretInput.trim()) {
      onPair(secretInput.trim());
      setSecretInput('');
    }
  };

  const handleScan = useCallback(
    (result: string) => {
      setShowScanner(false);
      if (result.trim()) {
        onPair(result.trim());
        setSecretInput('');
      }
    },
    [onPair]
  );

  const hostname = machine.hostname || machine.machine_id;
  const portSuffix = machine.port > 0 ? `:${machine.port}` : '';

  return (
    <div className="gateway-machine-card-container">
      {/* Main row */}
      <div className="flex items-center gap-3">
        {/* Machine info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {hostname}
              {portSuffix && <span className="opacity-50">{portSuffix}</span>}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {machine.platform && (
              <span className="text-xs opacity-50">{machine.platform}</span>
            )}
            <span
              className={`gateway-status-dot ${paired ? 'gateway-status-paired' : 'gateway-status-unpaired'}`}
            />
            <span className="text-xs opacity-50">
              {paired ? 'Paired' : 'Not paired'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {paired ? (
            <>
              <button
                type="button"
                onClick={onUnpair}
                className="gateway-button-text"
              >
                Unpair
              </button>
              <button
                type="button"
                onClick={onConnect}
                className="gateway-button-connect"
              >
                Connect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={isPairingOpen ? onClosePairing : onOpenPairing}
              className="gateway-button-secondary gateway-button-sm"
            >
              {isPairingOpen ? 'Cancel' : 'Pair'}
            </button>
          )}
        </div>
      </div>

      {/* Inline pair form */}
      {isPairingOpen && !paired && (
        <div
          className="mt-3 pt-3 border-t"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          {showScanner ? (
            <QRScanner
              onScan={handleScan}
              onClose={() => setShowScanner(false)}
            />
          ) : (
            <form onSubmit={handlePairSubmit} className="space-y-2">
              <input
                type="text"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="gateway-input font-mono text-xs"
                placeholder="Paste base64 master secret..."
                autoFocus
              />
              {pairError && (
                <div className="gateway-error">
                  <p className="text-xs">{pairError}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="gateway-button-secondary flex-1"
                >
                  Scan QR
                </button>
                <button
                  type="submit"
                  disabled={!secretInput.trim()}
                  className="gateway-button-primary flex-1"
                >
                  Pair
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
