import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';

// NiceModal.create is the registration step; for a unit test of the gate we
// only care about the component body it wraps, so make create() a pass-through.
vi.mock('@ebay/nice-modal-react', () => ({
  default: {
    create: (Comp: React.ComponentType<unknown>) => Comp,
  },
}));

import { createModal } from '@/lib/modals';
import {
  ConnectionProvider,
  useConnection,
} from '@/contexts/ConnectionContext';
import type { UnifiedConnection } from '@/lib/connections/types';

const fakeConnection = {} as UnifiedConnection;

// A dialog body that depends on BOTH connection and router, mirroring real
// dialogs like TaskFormDialog (useTaskMutations -> useNavigate).
const Dialog = createModal<Record<string, never>>(() => {
  useConnection();
  useNavigate();
  return <div>dialog body</div>;
}) as unknown as React.ComponentType<Record<string, never>>;

describe('createModal default gate (connection + router)', () => {
  it('renders nothing when there is a connection but no Router', () => {
    expect(() =>
      render(
        <ConnectionProvider connection={fakeConnection}>
          <Dialog />
        </ConnectionProvider>
      )
    ).not.toThrow();
    expect(screen.queryByText('dialog body')).not.toBeInTheDocument();
  });

  it('renders nothing when there is a Router but no connection', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <Dialog />
        </MemoryRouter>
      )
    ).not.toThrow();
    expect(screen.queryByText('dialog body')).not.toBeInTheDocument();
  });

  it('renders the body when both connection and Router are present', () => {
    render(
      <MemoryRouter>
        <ConnectionProvider connection={fakeConnection}>
          <Dialog />
        </ConnectionProvider>
      </MemoryRouter>
    );
    expect(screen.getByText('dialog body')).toBeInTheDocument();
  });
});
