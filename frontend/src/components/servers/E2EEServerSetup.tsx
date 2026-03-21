import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { E2EEServerConfig } from '@/lib/servers/types';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';

interface E2EEServerSetupProps {
  onDone: (config: E2EEServerConfig) => void;
  onBack: () => void;
}

/**
 * Simplified E2EE setup for Tauri.
 * Full gateway login/pairing flows are complex and reuse the browser GatewayContext.
 * For now: collect gateway URL + name → user completes auth via the web gateway flow.
 */
export function E2EEServerSetup({ onDone, onBack }: E2EEServerSetupProps) {
  const [name, setName] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');
  const [testOk, setTestOk] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestError('');
    setTestOk(false);

    try {
      const url = gatewayUrl.replace(/\/$/, '');
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
    onDone({
      id: crypto.randomUUID(),
      name: name || new URL(gatewayUrl).hostname,
      type: 'e2ee',
      gatewayUrl: gatewayUrl.replace(/\/$/, ''),
    });
  };

  const canTest = gatewayUrl.trim().length > 0;

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Name</label>
        <Input
          placeholder="My Gateway"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Gateway URL
        </label>
        <Input
          placeholder="https://gateway.example.com"
          value={gatewayUrl}
          onChange={(e) => {
            setGatewayUrl(e.target.value);
            setTestOk(false);
          }}
        />
      </div>

      {testOk && <p className="text-sm text-green-600">Gateway reachable.</p>}
      {testError && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{testError}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        After saving, you will need to complete gateway login and pairing via
        the server management page.
      </p>

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
          Test
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!testOk}>
          Save & Connect
        </Button>
      </div>
    </div>
  );
}
