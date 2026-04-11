/**
 * GatewayGate — wraps the main App and shows gateway-specific UI
 * (login, machine selection) until the E2EE connection is ready.
 * In local mode, it renders children directly.
 */
import type { ReactNode } from 'react';
import { useState, useCallback } from 'react';
import { useGateway } from '@/contexts/GatewayContext';
import { GatewayLoginPage } from './GatewayLoginPage';
import { GatewayMachineSelectPage } from './GatewayMachineSelectPage';
import { QueryClientProvider } from '@tanstack/react-query';

// Import styles so Tailwind classes work in gateway pages
import '@/styles/legacy/index.css';

export function GatewayGate({ children }: { children: ReactNode }) {
  const { phase, machineQueryClient } = useGateway();

  switch (phase) {
    case 'local':
      // Not gateway mode — render the app directly.
      // In Tauri, block app rendering until a backend URL is configured.
      if (
        typeof window !== 'undefined' &&
        window.__TAURI__ &&
        !localStorage.getItem('vb-backend-url')
      ) {
        return <TauriConnectionSetup />;
      }
      return <>{children}</>;

    case 'detecting':
      return (
        <GatewayShell>
          <p className="text-foreground opacity-60 animate-pulse text-center">
            Detecting...
          </p>
        </GatewayShell>
      );

    case 'login':
      return (
        <GatewayShell>
          <GatewayLoginPage />
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
          <p className="text-foreground opacity-60 animate-pulse text-center">
            Connecting to machine...
          </p>
        </GatewayShell>
      );

    case 'ready':
      // Wrap with per-machine QueryClient so each machine has isolated cache.
      // This overrides the parent QueryClientProvider from main.tsx.
      return machineQueryClient ? (
        <QueryClientProvider client={machineQueryClient}>
          {children}
        </QueryClientProvider>
      ) : (
        <>{children}</>
      );

    default:
      return <>{children}</>;
  }
}

/**
 * In Tauri with no backend URL configured, renders a full-screen connection
 * setup UI that blocks the app from rendering until configured.
 */
function TauriConnectionSetup() {
  return (
    <GatewayShell>
      <TauriConnectionSetupForm />
    </GatewayShell>
  );
}

type ConnectionMode = 'direct' | 'gateway';

function TauriConnectionSetupForm() {
  const [mode, setMode] = useState<ConnectionMode>('direct');
  const [backendUrl, setBackendUrl] = useState('http://localhost:3001');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testError, setTestError] = useState('');

  const testConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const resp = await fetch(`${backendUrl}/api/config/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(`Server returned ${resp.status}`);
      }
    } catch (e) {
      setTestStatus('error');
      setTestError(e instanceof Error ? e.message : 'Could not reach backend');
    }
  }, [backendUrl]);

  const handleSave = useCallback(() => {
    if (mode === 'direct') {
      localStorage.setItem('vb-backend-url', backendUrl);
      localStorage.removeItem('vb-gateway-url');
    } else {
      localStorage.setItem('vb-gateway-url', gatewayUrl);
      localStorage.removeItem('vb-backend-url');
    }
    window.location.reload();
  }, [mode, backendUrl, gatewayUrl]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
            marginBottom: '0.25rem',
          }}
        >
          Connection Setup
        </h2>
        <p
          style={{
            fontSize: '0.8125rem',
            color: 'hsl(var(--foreground) / 0.6)',
          }}
        >
          Configure how Vibe Board connects to the backend server.
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className={
            mode === 'direct'
              ? 'gateway-button-primary gateway-button-sm'
              : 'gateway-button-secondary gateway-button-sm'
          }
          onClick={() => setMode('direct')}
        >
          Direct (Local)
        </button>
        <button
          className={
            mode === 'gateway'
              ? 'gateway-button-primary gateway-button-sm'
              : 'gateway-button-secondary gateway-button-sm'
          }
          onClick={() => setMode('gateway')}
        >
          E2EE Gateway
        </button>
      </div>

      {mode === 'direct' ? (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                color: 'hsl(var(--foreground) / 0.6)',
                marginBottom: '0.25rem',
              }}
            >
              Backend URL
            </label>
            <input
              className="gateway-input"
              type="text"
              value={backendUrl}
              onChange={(e) => {
                setBackendUrl(e.target.value);
                setTestStatus('idle');
              }}
              placeholder="http://localhost:3001"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="gateway-button-secondary gateway-button-sm"
              onClick={testConnection}
              disabled={testStatus === 'testing' || !backendUrl}
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {testStatus === 'success' && (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                borderRadius: 'var(--radius)',
                background: 'hsl(142 76% 36% / 0.1)',
                border: '1px solid hsl(142 76% 36% / 0.3)',
                color: 'hsl(142 76% 36%)',
              }}
            >
              Connection successful
            </div>
          )}
          {testStatus === 'error' && (
            <div className="gateway-error" style={{ fontSize: '0.8125rem' }}>
              {testError}
            </div>
          )}

          <p
            style={{
              fontSize: '0.75rem',
              color: 'hsl(var(--foreground) / 0.5)',
              lineHeight: '1.4',
            }}
          >
            Start the backend with{' '}
            <code
              style={{
                background: 'hsl(var(--foreground) / 0.1)',
                padding: '0.125rem 0.375rem',
                borderRadius: '3px',
                fontSize: '0.75rem',
              }}
            >
              npx vibe-board
            </code>{' '}
            then enter the URL above.
          </p>
        </div>
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                color: 'hsl(var(--foreground) / 0.6)',
                marginBottom: '0.25rem',
              }}
            >
              Gateway URL
            </label>
            <input
              className="gateway-input"
              type="text"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              placeholder="https://gateway.example.com"
            />
          </div>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'hsl(var(--foreground) / 0.5)',
            }}
          >
            You will be prompted to log in after connecting to the gateway.
          </p>
        </div>
      )}

      <button
        className="gateway-button-primary"
        onClick={handleSave}
        disabled={mode === 'direct' ? !backendUrl : !gatewayUrl}
      >
        Save &amp; Connect
      </button>
    </div>
  );
}

function GatewayShell({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{gatewayStyles}</style>
      <div className="legacy-design gateway-shell">
        <div className="gateway-card">{children}</div>
      </div>
    </>
  );
}

const gatewayStyles = `
  .gateway-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: hsl(var(--background));
  }

  .gateway-card {
    width: 100%;
    max-width: 32rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    padding: 2rem;
    box-shadow: 0 4px 24px hsl(var(--foreground) / 0.08);
  }

  .gateway-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    color: hsl(var(--foreground));
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .gateway-input::placeholder {
    color: hsl(var(--foreground) / 0.5);
  }

  .gateway-input:focus {
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  .gateway-button-primary {
    width: 100%;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
    background: hsl(var(--foreground));
    color: hsl(var(--background));
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .gateway-button-primary:hover {
    opacity: 0.85;
  }

  .gateway-button-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gateway-button-secondary {
    width: 100%;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
    background: transparent;
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .gateway-button-secondary:hover {
    opacity: 0.85;
  }

  .gateway-button-sm {
    width: auto;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
  }

  .gateway-button-text {
    background: none;
    border: none;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-family: inherit;
    color: hsl(var(--foreground));
    opacity: 0.5;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .gateway-button-text:hover {
    opacity: 0.8;
  }

  .gateway-button-connect {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: hsl(var(--foreground));
    color: hsl(var(--background));
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    transition: opacity 0.15s ease;
    font-family: inherit;
  }

  .gateway-button-connect:hover {
    opacity: 0.85;
  }

  .gateway-link {
    color: hsl(var(--foreground));
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    font-family: inherit;
  }

  .gateway-link:hover {
    opacity: 0.8;
  }

  .gateway-error {
    padding: 0.75rem;
    background: hsl(var(--destructive) / 0.1);
    border: 1px solid hsl(var(--destructive) / 0.3);
    border-radius: var(--radius);
    color: hsl(var(--destructive));
  }

  .gateway-code-block {
    padding: 0.75rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    font-size: 0.75rem;
    line-height: 1rem;
    opacity: 0.8;
    word-break: break-all;
  }

  .gateway-code-block code {
    background: hsl(var(--foreground) / 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: calc(var(--radius) - 2px);
    font-family: inherit;
  }

  .gateway-machine-card-container {
    width: 100%;
    padding: 0.75rem 1rem;
    text-align: left;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    color: hsl(var(--foreground));
    font-family: inherit;
  }

  .gateway-status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .gateway-status-paired {
    background: hsl(var(--ring));
  }

  .gateway-status-unpaired {
    background: hsl(var(--foreground) / 0.25);
  }
`;
