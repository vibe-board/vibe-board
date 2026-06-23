import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { connectionGated } from '@/lib/modals';
import {
  ConnectionProvider,
  useConnection,
} from '@/contexts/ConnectionContext';
import type { UnifiedConnection } from '@/lib/connections/types';

// The bug: connection-dependent modals are rendered by multiple shared-store
// NiceModal providers, including one mounted OUTSIDE any <ConnectionProvider>
// (the gateway shell). Any modal body calling useConnection() crashed that
// copy with "useConnection must be used within ConnectionProvider", which the
// error boundary surfaced as a full app crash when clicking "+" to create a
// task. connectionGated() makes the connectionless copies render nothing.

const Body = connectionGated<Record<string, never>>(() => {
  // Mirrors what real dialogs do (useApi -> useConnection).
  useConnection();
  return <div>dialog body</div>;
});

const fakeConnection = {} as UnifiedConnection;

describe('connectionGated', () => {
  it('renders nothing (no throw) when there is no ConnectionProvider', () => {
    expect(() => render(<Body />)).not.toThrow();
    expect(screen.queryByText('dialog body')).not.toBeInTheDocument();
  });

  it('renders the body when wrapped in a ConnectionProvider', () => {
    render(
      <ConnectionProvider connection={fakeConnection}>
        <Body />
      </ConnectionProvider>
    );
    expect(screen.getByText('dialog body')).toBeInTheDocument();
  });
});
