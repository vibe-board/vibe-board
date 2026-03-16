/**
 * GatewayGate — wraps the main App and shows gateway-specific UI
 * (login, pairing, machine selection) until the E2EE connection is ready.
 * In local mode, it renders children directly.
 */
import type { ReactNode } from 'react';
import { useGateway } from '@/contexts/GatewayContext';
import { GatewayLoginPage } from './GatewayLoginPage';
import { GatewayPairPage } from './GatewayPairPage';
import { GatewayMachineSelectPage } from './GatewayMachineSelectPage';

// Import styles so Tailwind classes work in gateway pages
import '@/styles/legacy/index.css';

export function GatewayGate({ children }: { children: ReactNode }) {
  const { phase } = useGateway();

  switch (phase) {
    case 'local':
      // Not gateway mode — render the app directly
      return <>{children}</>;

    case 'detecting':
      return (
        <GatewayShell>
          <p className="text-muted-foreground animate-pulse">Detecting...</p>
        </GatewayShell>
      );

    case 'login':
      return (
        <GatewayShell>
          <GatewayLoginPage />
        </GatewayShell>
      );

    case 'pair':
      return (
        <GatewayShell>
          <GatewayPairPage />
        </GatewayShell>
      );

    case 'machine_select':
      return (
        <GatewayShell>
          <GatewayMachineSelectPage />
        </GatewayShell>
      );

    case 'connecting':
      return (
        <GatewayShell>
          <p className="text-muted-foreground animate-pulse">
            Connecting to machine...
          </p>
        </GatewayShell>
      );

    case 'ready':
      return <>{children}</>;

    default:
      return <>{children}</>;
  }
}

function GatewayShell({ children }: { children: ReactNode }) {
  return (
    <div className="legacy-design flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">{children}</div>
    </div>
  );
}
