import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DirectServerConfig } from '@/lib/servers/types';
import { getServerBaseUrl } from '@/lib/servers/types';
import { ArrowLeft, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

interface DirectServerSetupProps {
  onDone: (config: DirectServerConfig) => void;
  onBack: () => void;
}

export function DirectServerSetup({ onDone, onBack }: DirectServerSetupProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3000');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );
  const [testError, setTestError] = useState('');

  const config: DirectServerConfig = {
    id: crypto.randomUUID(),
    name: name || `${host}:${port}`,
    type: 'direct',
    host,
    port: parseInt(port, 10) || 3000,
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('idle');
    setTestError('');

    try {
      const baseUrl = getServerBaseUrl(config);
      const resp = await fetch(`${baseUrl}/api/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }
      setTestResult('success');
    } catch (err) {
      setTestResult('error');
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onDone({
      ...config,
      name: name || `${host}:${port}`,
    });
  };

  const canTest = host.trim().length > 0;
  const canSave = testResult === 'success';

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Name</label>
        <Input
          placeholder="My Server"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-2">
          <label className="text-sm font-medium text-foreground">Host</label>
          <Input
            placeholder="192.168.1.100"
            value={host}
            onChange={(e) => {
              setHost(e.target.value);
              setTestResult('idle');
            }}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Port</label>
          <Input
            type="number"
            placeholder="3000"
            value={port}
            onChange={(e) => {
              setPort(e.target.value);
              setTestResult('idle');
            }}
          />
        </div>
      </div>

      {testResult === 'success' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Connection successful
        </div>
      )}

      {testResult === 'error' && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{testError}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={!canTest || testing}
        >
          {testing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Test Connection
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          Save & Connect
        </Button>
      </div>
    </div>
  );
}
