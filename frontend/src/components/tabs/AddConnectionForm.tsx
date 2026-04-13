// frontend/src/components/tabs/AddConnectionForm.tsx
import { useState, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connection-store';

type ConnectionMode = 'direct' | 'gateway';

export function AddConnectionForm({ onDone }: { onDone?: () => void }) {
  const addConnection = useConnectionStore((s) => s.addConnection);
  const [mode, setMode] = useState<ConnectionMode>('direct');
  const [url, setUrl] = useState('');
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testError, setTestError] = useState('');

  const testConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const resp = await fetch(`${url}/api/config/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) setTestStatus('success');
      else {
        setTestStatus('error');
        setTestError(`Server returned ${resp.status}`);
      }
    } catch (e) {
      setTestStatus('error');
      setTestError(e instanceof Error ? e.message : 'Could not reach backend');
    }
  }, [url]);

  const handleAdd = useCallback(() => {
    if (!url.trim()) return;
    addConnection(mode, url.trim());
    setUrl('');
    setTestStatus('idle');
    onDone?.();
  }, [mode, url, addConnection, onDone]);

  return (
    <div className="border border-border rounded-md p-3 bg-background space-y-3">
      <div className="flex gap-2">
        <button
          className={`px-2 py-1 text-xs rounded border ${
            mode === 'direct'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-foreground/70 hover:text-foreground'
          }`}
          onClick={() => setMode('direct')}
        >
          Direct (Local)
        </button>
        <button
          className={`px-2 py-1 text-xs rounded border ${
            mode === 'gateway'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-foreground/70 hover:text-foreground'
          }`}
          onClick={() => setMode('gateway')}
        >
          E2EE Gateway
        </button>
      </div>

      <div>
        <label className="text-xs text-foreground/60 block mb-1">
          {mode === 'direct' ? 'Backend URL' : 'Gateway URL'}
        </label>
        <input
          className="w-full px-2 py-1.5 text-sm bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTestStatus('idle');
          }}
          placeholder={
            mode === 'direct'
              ? 'http://localhost:3001'
              : 'https://gateway.example.com'
          }
        />
      </div>

      {mode === 'direct' && (
        <div className="flex gap-2 items-center">
          <button
            className="px-2 py-1 text-xs border border-border rounded text-foreground/70 hover:text-foreground"
            onClick={testConnection}
            disabled={testStatus === 'testing' || !url}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {testStatus === 'success' && (
            <span className="text-xs text-green-500">Connected</span>
          )}
          {testStatus === 'error' && (
            <span className="text-xs text-destructive">{testError}</span>
          )}
        </div>
      )}

      <button
        className="w-full px-3 py-1.5 text-sm font-medium bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
        onClick={handleAdd}
        disabled={!url.trim()}
      >
        Add Connection
      </button>
    </div>
  );
}
