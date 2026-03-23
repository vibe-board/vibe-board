import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useE2EE } from '@/hooks/useE2ee';
import { useGatewayAuth, type GatewaySession } from '@/hooks/useGatewayAuth';
import { deriveAuthKeyPair } from '@/lib/e2ee';

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

const E2EESettingsDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const {
    machines,
    connected,
    connectToGateway,
    disconnect,
    addPairedSecret,
    error: e2eeError,
  } = useE2EE();

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

  // Master secret state
  const [masterSecret, setMasterSecret] = useState<string | null>(null);
  const [pastedSecret, setPastedSecret] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

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

  // After login, user pastes OOB secret from bridge terminal
  const handleSetupFromSecret = async () => {
    if (!session || !pastedSecret.trim()) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const secretB64 = pastedSecret.trim();
      const secretBytes = Uint8Array.from(atob(secretB64), (c) =>
        c.charCodeAt(0)
      );
      const authKp = await deriveAuthKeyPair(secretBytes);
      const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

      await registerDevice(session.gatewayUrl, session.sessionToken, pubKeyB64);

      await notifyBackendCredentials(secretB64, session);

      addPairedSecret(secretB64);
      setMasterSecret(secretB64);
      setPastedSecret('');
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setSetupLoading(false);
    }
  };

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

  const handleLogout = useCallback(async () => {
    logout();
    setMasterSecret(null);
    setPastedSecret('');
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

          {/* Section 2: Master Secret (OOB from bridge) */}
          {isAuthenticated && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t('settings.general.e2ee.masterSecret.label', 'Master Secret')}
              </Label>

              {setupLoading ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'settings.general.e2ee.masterSecret.registering',
                    'Registering device and setting up...'
                  )}
                </p>
              ) : masterSecret ? (
                <p className="text-sm text-green-500">
                  {t(
                    'settings.general.e2ee.masterSecret.paired',
                    'E2EE paired successfully'
                  )}
                </p>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder={t(
                      'settings.general.e2ee.masterSecret.placeholder',
                      'Paste master secret from bridge terminal'
                    )}
                    value={pastedSecret}
                    onChange={(e) => setPastedSecret(e.target.value)}
                  />
                  <Button
                    onClick={handleSetupFromSecret}
                    disabled={!pastedSecret.trim() || setupLoading}
                    className="w-full"
                    size="sm"
                  >
                    {t(
                      'settings.general.e2ee.masterSecret.pair',
                      'Pair with Bridge'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'settings.general.e2ee.masterSecret.localStorageWarning',
                      "The master secret will be stored in your browser's localStorage."
                    )}
                  </p>
                </div>
              )}

              {/* Connection Status */}
              <div className="flex items-center justify-between">
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
                {connected && (
                  <Button variant="outline" size="sm" onClick={disconnect}>
                    {t(
                      'settings.general.e2ee.masterSecret.disconnect',
                      'Disconnect'
                    )}
                  </Button>
                )}
              </div>
              {(setupError || e2eeError) && (
                <p className="text-xs text-red-500">
                  {setupError || e2eeError}
                </p>
              )}
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
                    {isAuthenticated && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConnect(m.machine_id)}
                        disabled={selectedMachineId === m.machine_id}
                      >
                        {selectedMachineId === m.machine_id
                          ? t(
                              'settings.general.e2ee.machines.connected',
                              'Connected'
                            )
                          : t(
                              'settings.general.e2ee.machines.connect',
                              'Connect'
                            )}
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

export const E2EESettingsDialog = defineModal<void, void>(
  E2EESettingsDialogImpl
);
