import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MachineStatus } from '@/lib/e2ee';
import { ScopedNiceModalProvider } from '@/contexts/NiceModalStoreContext';

// Integration test: the real UnpairMachineDialog must actually render when
// the kebab -> Unpair action runs. This catches the "click does nothing"
// regression where GatewayShell mounted GatewayHomeTab with no
// NiceModal.Provider in the tree, so the dialog never appeared.

const unpairMachine = vi.fn();
const openMachineProjectsTab = vi.fn();
const logoutConnection = vi.fn();

const pairedSecrets: Record<string, string> = { 'machine-1': 'secret' };
const machines: MachineStatus[] = [
  {
    machine_id: 'machine-1',
    hostname: 'devbox',
    platform: 'linux',
    port: 3000,
  },
];

type Selector<T> = (s: unknown) => T;
const state = {
  nodes: [{ entry: { id: 'gateway-self' }, gatewayState: { machines } }],
  machineSecrets: pairedSecrets,
  unpairMachine,
  openMachineProjectsTab,
  logoutConnection,
};

vi.mock('@/stores/connection-store', () => ({
  useConnectionStore: <T,>(selector: Selector<T>) => selector(state),
}));

vi.mock('@/utils/conversationCache', () => ({
  clearAllCachedEntries: () => Promise.resolve(),
}));

vi.mock('../MachinePairingForm', () => ({
  MachinePairingForm: () => null,
}));

import { GatewayHomeTab } from '../GatewayHomeTab';

describe('GatewayHomeTab unpair dialog rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the real Unpair confirmation dialog when Unpair is clicked', async () => {
    render(
      <ScopedNiceModalProvider>
        <GatewayHomeTab connectionId="gateway-self" />
      </ScopedNiceModalProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Machine actions' }));
    fireEvent.click(screen.getByText('Unpair'));

    // The dialog (title) must actually appear for the user to confirm.
    await waitFor(() => {
      expect(screen.getByText('Unpair machine')).toBeInTheDocument();
    });
  });
});
