import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DirectServerConfig } from '@/lib/servers/types';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface DirectServerSetupProps {
  onDone: (config: DirectServerConfig) => void;
  onBack: () => void;
}

function normalizeUrl(raw: string): string {
  let url = raw.trim().replace(/\/$/, '');
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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="server-url">Server URL</Label>
        <Input
          id="server-url"
          placeholder="192.168.1.100:3000"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTestResult('idle');
          }}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="url"
        />
        <p className="text-xs text-muted-foreground">
          Full URL of your Vibe Board server. http:// is added automatically.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="server-name">Name (optional)</Label>
        <Input
          id="server-name"
          placeholder={serverName || 'My Server'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </div>

      {testResult === 'success' && (
        <output
          aria-live="polite"
          className="block rounded-sm bg-green-500/10 p-3 text-green-600 dark:text-green-400 text-xs"
        >
          Connection successful{serverName ? ` — ${serverName}` : ''}
        </output>
      )}

      {testResult === 'error' && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-sm bg-destructive/10 p-3 text-destructive text-xs"
        >
          {testError}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
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
          Test
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
