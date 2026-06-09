import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MachineStatus } from '@/lib/e2ee';

// --- Mocks (declared before importing the component) ---

const unpairMachine = vi.fn();
const openMachineProjectsTab = vi.fn();
const logoutConnection = vi.fn();

// Minimal store mock: machine-1 is paired, machine-2 is not.
const pairedSecrets: Record<string, string> = { 'machine-1': 'secret' };
const machines: MachineStatus[] = [
  {
    machine_id: 'machine-1',
    hostname: 'devbox',
    platform: 'linux',
    port: 3000,
  },
  { machine_id: 'machine-2', hostname: 'laptop', platform: 'mac', port: 0 },
];

type Selector<T> = (s: unknown) => T;
const state = {
  nodes: [
    {
      entry: { id: 'gateway-self' },
      gatewayState: { machines },
    },
  ],
  machineSecrets: pairedSecrets,
  unpairMachine,
  openMachineProjectsTab,
  logoutConnection,
};

vi.mock('@/stores/connection-store', () => ({
  useConnectionStore: <T,>(selector: Selector<T>) => selector(state),
}));

const clearAllCachedEntries = vi.fn(() => Promise.resolve());
vi.mock('@/utils/conversationCache', () => ({
  clearAllCachedEntries: (...args: unknown[]) => clearAllCachedEntries(...args),
}));

let dialogResult: { confirmed: boolean; clearCache: boolean } = {
  confirmed: true,
  clearCache: false,
};
const showDialog = vi.fn(() => Promise.resolve(dialogResult));
vi.mock('@/components/dialogs', () => ({
  UnpairMachineDialog: { show: (...args: unknown[]) => showDialog(...args) },
}));

// MachinePairingForm renders nothing in this test
vi.mock('../MachinePairingForm', () => ({
  MachinePairingForm: () => null,
}));

import { GatewayHomeTab } from '../GatewayHomeTab';

describe('GatewayHomeTab MachineRow unpair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogResult = { confirmed: true, clearCache: false };
  });

  it('shows the kebab menu only for paired machines', () => {
    render(<GatewayHomeTab connectionId="gateway-self" />);
    // Exactly one paired machine (machine-1) → exactly one kebab.
    const kebabs = screen.getAllByRole('button', { name: 'Machine actions' });
    expect(kebabs).toHaveLength(1);
    fireEvent.click(kebabs[0]);
    expect(screen.getByText('Unpair')).toBeInTheDocument();
  });

  it('calls unpairMachine when the dialog is confirmed', async () => {
    render(<GatewayHomeTab connectionId="gateway-self" />);
    const kebab = screen.getByRole('button', { name: 'Machine actions' });
    fireEvent.click(kebab);
    fireEvent.click(screen.getByText('Unpair'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalledWith({ hostname: 'devbox' });
      expect(unpairMachine).toHaveBeenCalledWith('gateway-self', 'machine-1');
    });
    expect(clearAllCachedEntries).not.toHaveBeenCalled();
    expect(openMachineProjectsTab).not.toHaveBeenCalled();
  });

  it('does not unpair when the dialog is canceled', async () => {
    dialogResult = { confirmed: false, clearCache: false };
    render(<GatewayHomeTab connectionId="gateway-self" />);
    fireEvent.click(screen.getByRole('button', { name: 'Machine actions' }));
    fireEvent.click(screen.getByText('Unpair'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalled();
    });
    expect(unpairMachine).not.toHaveBeenCalled();
    expect(clearAllCachedEntries).not.toHaveBeenCalled();
  });

  it('clears cached data when the checkbox was ticked', async () => {
    dialogResult = { confirmed: true, clearCache: true };
    render(<GatewayHomeTab connectionId="gateway-self" />);
    fireEvent.click(screen.getByRole('button', { name: 'Machine actions' }));
    fireEvent.click(screen.getByText('Unpair'));

    await waitFor(() => {
      expect(unpairMachine).toHaveBeenCalledWith('gateway-self', 'machine-1');
      expect(clearAllCachedEntries).toHaveBeenCalledTimes(1);
    });
  });
});
