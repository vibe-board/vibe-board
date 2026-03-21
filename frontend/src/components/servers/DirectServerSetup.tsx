import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DirectServerConfig } from '@/lib/servers/types';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';

interface DirectServerSetupProps {
  onDone: (config: DirectServerConfig) => void;
  onBack: () => void;
}

function normalizeUrl(raw: string): string {
  let url = raw.trim().replace(/\/$/, '');
  // If no protocol, default to http (LAN/local use case)
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
}

export function DirectServerSetup({ onDone, onBack }: DirectServerSetupProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );
  const [testError, setTestError] = useState('');
  const [serverName, setServerName] = useState('');

  const handleTest = async () => {
    setTesting(true);
    setTestResult('idle');
    setTestError('');
    setServerName('');

    try {
      const baseUrl = normalizeUrl(url);
      const resp = await fetch(`${baseUrl}/api/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }
      // Try to extract server name from response
      try {
        const data = await resp.json();
        if (data?.name) {
          setServerName(data.name);
        }
      } catch {
        // ignore JSON parse errors
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
    const baseUrl = normalizeUrl(url);
    const displayName = name || serverName || new URL(baseUrl).host;
    onDone({
      id: crypto.randomUUID(),
      name: displayName,
      type: 'direct',
      url: baseUrl,
    });
  };

  const canTest = url.trim().length > 0;
  const canSave = testResult === 'success';

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Server URL
        </label>
        <Input
          placeholder="http://192.168.1.100:3000"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTestResult('idle');
          }}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <p className="text-xs text-muted-foreground">
          Enter the full URL of your Vibe Board server
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Name (optional)
        </label>
        <Input
          placeholder={serverName || 'My Server'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {testResult === 'success' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Connection successful
          {serverName && ` — ${serverName}`}
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
          Cancel
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
