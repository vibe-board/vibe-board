import { useState, useCallback } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ConnectionMode = 'direct' | 'gateway';

const DialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const [mode, setMode] = useState<ConnectionMode>(() => {
    if (localStorage.getItem('vb-gateway-url')) return 'gateway';
    return 'direct';
  });
  const [backendUrl, setBackendUrl] = useState(
    () => localStorage.getItem('vb-backend-url') || 'http://localhost:3001'
  );
  const [gatewayUrl, setGatewayUrl] = useState(
    () => localStorage.getItem('vb-gateway-url') || ''
  );
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testError, setTestError] = useState('');
  const [backendStatus, setBackendStatus] = useState<
    'idle' | 'starting' | 'running' | 'error'
  >('idle');
  const [backendError, setBackendError] = useState('');

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

  const startBackend = useCallback(async () => {
    if (!window.__TAURI__) return;
    setBackendStatus('starting');
    setBackendError('');
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('npx', ['vibe-board']);
      cmd.stderr.on('data', (line: string) => {
        // Detect when server is ready by checking for port output
        if (line.includes('listening') || line.includes('http://')) {
          setBackendStatus('running');
        }
      });
      cmd.on('error', (err: string) => {
        setBackendStatus('error');
        setBackendError(err);
      });
      cmd.on('close', (data: { code: number | null }) => {
        if (data.code !== 0 && backendStatus !== 'running') {
          setBackendStatus('error');
          setBackendError(`Process exited with code ${data.code}`);
        }
      });
      await cmd.spawn();
    } catch (e) {
      setBackendStatus('error');
      setBackendError(e instanceof Error ? e.message : 'Failed to start');
    }
  }, [backendStatus]);

  const handleSave = useCallback(() => {
    if (mode === 'direct') {
      localStorage.setItem('vb-backend-url', backendUrl);
      localStorage.removeItem('vb-gateway-url');
    } else {
      localStorage.setItem('vb-gateway-url', gatewayUrl);
      localStorage.removeItem('vb-backend-url');
    }
    // Reload to re-trigger gateway detection with new config
    window.location.reload();
  }, [mode, backendUrl, gatewayUrl]);

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) modal.hide();
      }}
      className="sm:max-w-lg"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connection Setup</DialogTitle>
          <DialogDescription>
            Configure how Vibe Board connects to the backend server.
          </DialogDescription>
        </DialogHeader>

        {/* Mode selector */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'direct' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('direct')}
          >
            Direct (Local)
          </Button>
          <Button
            variant={mode === 'gateway' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('gateway')}
          >
            E2EE Gateway
          </Button>
        </div>

        {mode === 'direct' ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Backend URL
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                value={backendUrl}
                onChange={(e) => {
                  setBackendUrl(e.target.value);
                  setTestStatus('idle');
                }}
                placeholder="http://localhost:3001"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={testStatus === 'testing' || !backendUrl}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </Button>
              {window.__TAURI__ && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startBackend}
                  disabled={
                    backendStatus === 'starting' || backendStatus === 'running'
                  }
                >
                  {backendStatus === 'starting'
                    ? 'Starting...'
                    : backendStatus === 'running'
                      ? 'Running'
                      : 'Start Local Backend'}
                </Button>
              )}
            </div>

            {testStatus === 'success' && (
              <Alert variant="success">
                <AlertDescription>Connection successful</AlertDescription>
              </Alert>
            )}
            {testStatus === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>{testError}</AlertDescription>
              </Alert>
            )}
            {backendStatus === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>{backendError}</AlertDescription>
              </Alert>
            )}
            {backendStatus === 'running' && (
              <Alert variant="success">
                <AlertDescription>Local backend is running</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Gateway URL
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="https://gateway.example.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              You will be prompted to log in after connecting to the gateway.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleSave}>Save &amp; Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ConnectionSetupDialog = defineModal<void, void>(DialogImpl);
