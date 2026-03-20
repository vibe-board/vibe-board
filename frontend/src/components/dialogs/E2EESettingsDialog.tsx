import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useE2EE } from '@/hooks/useE2ee';
import { useGatewayAuth, type GatewaySession } from '@/hooks/useGatewayAuth';
import { deriveAuthKeyPair, randomBytes } from '@/lib/e2ee';

function generateMasterSecretB64(): string {
  const bytes = randomBytes(32);
  return btoa(String.fromCharCode(...bytes));
}

async function registerDevice(
  gatewayUrl: string,
  sessionToken: string,
  authPublicKeyB64: string
): Promise<void> {
  const resp = await fetch(`${gatewayUrl}/api/auth/device/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      public_key: authPublicKeyB64,
      device_name: 'WebUI',
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Device registration failed (${resp.status}): ${text}`);
  }
}

async function notifyBackendCredentials(
  masterSecret: string,
  session: GatewaySession
) {
  await fetch('/api/e2ee/credentials', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      master_secret: masterSecret,
      gateway_url: session.gatewayUrl,
      session_token: session.sessionToken,
      user_id: session.userId,
    }),
  });
}

async function notifyBackendLogout() {
  try {
    await fetch('/api/e2ee/credentials', { method: 'DELETE' });
  } catch {
    // Best-effort
  }
}

export interface E2EESettingsDialogProps {}

const E2EESettingsDialogImpl = NiceModal.create<E2EESettingsDialogProps>(() => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const { machines, connected, connectToGateway, error: e2eeError } = useE2EE();

  const {
    session,
    isAuthenticated,
    loading: authLoading,
    error: authError,
    checkRegistrationStatus,
    signup,
    login,
    logout,
  } = useGatewayAuth();

  // Gateway auth form state
  const [gatewayUrl, setGatewayUrl] = useState(session?.gatewayUrl || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);

  // Generated master secret state
  const [masterSecret, setMasterSecret] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Machine selection
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    null
  );

  // Check registration status when gateway URL changes
  useEffect(() => {
    if (!gatewayUrl) return;
    let cancelled = false;
    checkRegistrationStatus(gatewayUrl)
      .then((open) => {
        if (!cancelled) {
          setRegistrationOpen(open);
          if (open) setIsSignupMode(true);
        }
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, checkRegistrationStatus]);

  // After login, auto-setup: generate secret, register device, notify backend
  useEffect(() => {
    if (!isAuthenticated || !session || masterSecret) return;
    let cancelled = false;

    const setup = async () => {
      setSetupLoading(true);
      setSetupError(null);
      try {
        const secretB64 = generateMasterSecretB64();
        const secretBytes = Uint8Array.from(atob(secretB64), (c) =>
          c.charCodeAt(0)
        );
        const authKp = await deriveAuthKeyPair(secretBytes);
        const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

        await registerDevice(
          session.gatewayUrl,
          session.sessionToken,
          pubKeyB64
        );
        if (cancelled) return;

        await notifyBackendCredentials(secretB64, session);
        if (cancelled) return;

        setMasterSecret(secretB64);
      } catch (e) {
        if (!cancelled) {
          setSetupError(e instanceof Error ? e.message : 'Setup failed');
        }
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    };

    setup();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, session, masterSecret]);

  const handleAuth = async () => {
    if (!gatewayUrl.trim()) return;
    try {
      if (isSignupMode) {
        await signup(gatewayUrl, email, password, name || undefined);
      } else {
        await login(gatewayUrl, email, password);
      }
      setEmail('');
      setPassword('');
      setName('');
    } catch {
      // error is set in hook
    }
  };

  const handleConnect = async (machineId: string) => {
    if (!session) return;
    setSelectedMachineId(machineId);
    await connectToGateway(session.gatewayUrl, session.sessionToken, machineId);
  };

  const handleCopySecret = async () => {
    if (!masterSecret) return;
    await navigator.clipboard.writeText(masterSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = useCallback(async () => {
    logout();
    setMasterSecret(null);
    setSetupError(null);
    await notifyBackendLogout();
  }, [logout]);

  return (
    <Dialog open={modal.visible} onOpenChange={() => modal.hide()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('settings.general.e2ee.title', 'E2EE Settings')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'settings.general.e2ee.description',
              'Configure end-to-end encryption for remote access.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Section 1: Gateway Authentication */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              {t('settings.general.e2ee.gateway.label', 'Gateway')}
            </Label>

            {isAuthenticated && session ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{session.gatewayUrl}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.general.e2ee.gateway.userId', 'User ID')}:{' '}
                      {session.userId}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    {t('settings.general.e2ee.gateway.logout', 'Logout')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder={t(
                    'settings.general.e2ee.gateway.urlPlaceholder',
                    'Gateway URL (e.g., https://gateway.example.com)'
                  )}
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                />

                {registrationOpen && (
                  <div className="flex gap-2 text-xs">
                    <button
                      className={`${!isSignupMode ? 'font-bold underline' : 'text-muted-foreground'}`}
                      onClick={() => setIsSignupMode(false)}
                    >
                      {t('settings.general.e2ee.gateway.login', 'Login')}
                    </button>
                    <span className="text-muted-foreground">/</span>
                    <button
                      className={`${isSignupMode ? 'font-bold underline' : 'text-muted-foreground'}`}
                      onClick={() => setIsSignupMode(true)}
                    >
                      {t('settings.general.e2ee.gateway.signup', 'Sign Up')}
                    </button>
                  </div>
                )}

                <Input
                  placeholder={t(
                    'settings.general.e2ee.gateway.emailPlaceholder',
                    'Email'
                  )}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Input
                  placeholder={t(
                    'settings.general.e2ee.gateway.passwordPlaceholder',
                    'Password'
                  )}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAuth();
                  }}
                />
                {isSignupMode && (
                  <Input
                    placeholder={t(
                      'settings.general.e2ee.gateway.namePlaceholder',
                      'Name (optional)'
                    )}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}

                {authError && (
                  <p className="text-xs text-red-500">{authError}</p>
                )}

                <Button
                  onClick={handleAuth}
                  disabled={authLoading || !gatewayUrl || !email || !password}
                  className="w-full"
                  size="sm"
                >
                  {authLoading
                    ? t(
                        'settings.general.e2ee.gateway.connecting',
                        'Connecting...'
                      )
                    : isSignupMode
                      ? t(
                          'settings.general.e2ee.gateway.createAccount',
                          'Create Account'
                        )
                      : t('settings.general.e2ee.gateway.loginButton', 'Login')}
                </Button>
              </div>
            )}
          </div>

          {/* Section 2: Master Secret (auto-generated after login) */}
          {isAuthenticated && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t('settings.general.e2ee.masterSecret.label', 'Master Secret')}
              </Label>

              {setupLoading ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'settings.general.e2ee.masterSecret.generating',
                    'Generating master secret and registering device...'
                  )}
                </p>
              ) : setupError ? (
                <p className="text-xs text-red-500">{setupError}</p>
              ) : masterSecret ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                      {masterSecret}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySecret}
                    >
                      {copied
                        ? t(
                            'settings.general.e2ee.masterSecret.copied',
                            'Copied!'
                          )
                        : t('settings.general.e2ee.masterSecret.copy', 'Copy')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'settings.general.e2ee.masterSecret.hint',
                      'Use this secret to pair other devices or CLI tools.'
                    )}
                  </p>
                </div>
              ) : null}

              {/* Connection Status */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    connected ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  {connected
                    ? t(
                        'settings.general.e2ee.masterSecret.connected',
                        'Connected'
                      )
                    : t(
                        'settings.general.e2ee.masterSecret.notConnected',
                        'Not connected'
                      )}
                </span>
              </div>
              {e2eeError && <p className="text-xs text-red-500">{e2eeError}</p>}
            </div>
          )}

          {/* Section 3: Online Machines */}
          {machines.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t('settings.general.e2ee.machines.label', 'Online Machines')}
              </Label>
              <div className="space-y-1">
                {machines.map((m) => (
                  <div
                    key={m.machine_id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm">
                        {m.hostname || m.machine_id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({m.platform})
                      </span>
                    </div>
                    {isAuthenticated && !connected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConnect(m.machine_id)}
                        disabled={selectedMachineId === m.machine_id}
                      >
                        {t('settings.general.e2ee.machines.connect', 'Connect')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => modal.hide()}>
            {t('settings.general.e2ee.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const E2EESettingsDialog = defineModal<E2EESettingsDialogProps, void>(
  E2EESettingsDialogImpl
);
