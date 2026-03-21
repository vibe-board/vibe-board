import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { E2EEServerConfig } from '@/lib/servers/types';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface E2EEServerSetupProps {
  onDone: (config: E2EEServerConfig) => void;
  onBack: () => void;
}

function normalizeGatewayUrl(raw: string): string {
  let url = raw.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

export function E2EEServerSetup({ onDone, onBack }: E2EEServerSetupProps) {
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [name, setName] = useState('');
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [testError, setTestError] = useState('');

  const handleTest = async () => {
    setTesting(true);
    setTestError('');
    setTestOk(false);

    try {
      const url = normalizeGatewayUrl(gatewayUrl);
      const resp = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`Gateway returned ${resp.status}`);
      setTestOk(true);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const url = normalizeGatewayUrl(gatewayUrl);
    const displayName = name || new URL(url).hostname;
    onDone({
      id: crypto.randomUUID(),
      name: displayName,
      type: 'e2ee',
      gatewayUrl: url,
    });
  };

  const canTest = gatewayUrl.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gateway-url">Gateway URL</Label>
        <Input
          id="gateway-url"
          placeholder="https://gateway.example.com"
          value={gatewayUrl}
          onChange={(e) => {
            setGatewayUrl(e.target.value);
            setTestOk(false);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="url"
        />
        <p className="text-xs text-muted-foreground">
          Enter the URL of your E2EE relay gateway. https:// is added
          automatically.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gateway-name">Name (optional)</Label>
        <Input
          id="gateway-name"
          placeholder="My Gateway"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </div>

      {testOk && (
        <output
          aria-live="polite"
          className="block rounded-sm bg-green-500/10 p-3 text-green-600 dark:text-green-400 text-xs"
        >
          Gateway reachable
        </output>
      )}

      {testError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-sm bg-destructive/10 p-3 text-destructive text-xs"
        >
          {testError}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        After saving, complete gateway login and E2EE pairing from the Settings
        page.
      </p>

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
        <Button size="sm" onClick={handleSave} disabled={!testOk}>
          Save
        </Button>
      </div>
    </div>
  );
}
