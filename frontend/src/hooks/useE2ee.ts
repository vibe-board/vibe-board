import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { E2EEManager, E2EEConnection, type MachineStatus } from '@/lib/e2ee';

/** Global singleton instances */
const manager = E2EEManager.getInstance();
const connection = new E2EEConnection();

/** External store for React — tracks paired secrets state */
let secretsVersion = 0;
const secretsListeners = new Set<() => void>();

function notifySecretsChanged() {
  secretsVersion++;
  secretsListeners.forEach((l) => l());
}

function subscribeSecrets(callback: () => void) {
  secretsListeners.add(callback);
  return () => secretsListeners.delete(callback);
}

function getSecretsSnapshot() {
  return secretsVersion;
}

/**
 * React hook for E2EE state management.
 *
 * Provides:
 * - Per-machine secret management (pair/unpair)
 * - Machine list (online daemons)
 * - Gateway connection state
 */
export function useE2EE() {
  // Subscribe to secrets changes
  useSyncExternalStore(subscribeSecrets, getSecretsSnapshot);

  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to machine list changes
  useEffect(() => {
    return connection.onMachinesChanged((m) => setMachines(m));
  }, []);

  const pairMachine = useCallback((machineId: string, base64Secret: string) => {
    try {
      manager.pairMachine(machineId, base64Secret);
      notifySecretsChanged();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to pair machine');
    }
  }, []);

  const unpairMachine = useCallback((machineId: string) => {
    manager.unpairMachine(machineId);
    notifySecretsChanged();
  }, []);

  const clearSecrets = useCallback(() => {
    manager.clearAll();
    notifySecretsChanged();
  }, []);

  const connectToGateway = useCallback(
    async (gatewayUrl: string, sessionToken: string, machineId: string) => {
      setConnecting(true);
      setError(null);
      try {
        await connection.connect({
          gatewayUrl,
          sessionToken,
          machineId,
          onConnect: () => setConnected(true),
          onDisconnect: () => setConnected(false),
          onError: (err) => setError(err),
        });
        connection.subscribeMachine(machineId);
        // Establish DEK before marking connection as ready
        if (manager.isMachinePaired(machineId)) {
          await connection.initDek();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Connection failed');
        setConnected(false);
      } finally {
        setConnecting(false);
      }
    },
    []
  );

  const disconnect = useCallback(() => {
    connection.disconnect();
    setConnected(false);
  }, []);

  return {
    // Secrets
    hasPairedSecrets: manager.hasPairedSecrets,
    pairedMachineIds: manager.pairedMachineIds,
    pairMachine,
    unpairMachine,
    clearSecrets,

    // Connection
    connected,
    connecting,
    machines,
    connectToGateway,
    disconnect,

    // E2EE instances (for direct use)
    connection,
    manager,

    // Error
    error,
  };
}
