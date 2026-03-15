import { useState, useEffect } from 'react';
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
import { useGatewayAuth } from '@/hooks/useGatewayAuth';

export interface E2EESettingsDialogProps {}

const E2EESettingsDialogImpl =
  NiceModal.create<E2EESettingsDialogProps>(() => {
    const modal = useModal();
    const {
      hasPairedSecrets,
      pairedSecretIds,
      addPairedSecret,
      clearSecrets,
      connected,
      machines,
      connectToGateway,
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
    const [gatewayUrl, setGatewayUrl] = useState(
      session?.gatewayUrl || '',
    );
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isSignupMode, setIsSignupMode] = useState(false);
    const [registrationOpen, setRegistrationOpen] = useState(false);

    // Secret pairing form
    const [secretInput, setSecretInput] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);

    // Machine selection
    const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
      null,
    );

    // Check registration status when gateway URL changes
    useEffect(() => {
      if (!gatewayUrl) return;
      let cancelled = false;
      checkRegistrationStatus(gatewayUrl).then((open) => {
        if (!cancelled) {
          setRegistrationOpen(open);
          if (open) setIsSignupMode(true);
        }
      }).catch(() => {
        // ignore
      });
      return () => {
        cancelled = true;
      };
    }, [gatewayUrl, checkRegistrationStatus]);

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

    const handlePair = () => {
      const trimmed = secretInput.trim();
      if (!trimmed) {
        setInputError('Please enter a master secret');
        return;
      }

      try {
        const decoded = atob(trimmed);
        if (decoded.length !== 32) {
          setInputError('Master secret must be 32 bytes (44 base64 chars)');
          return;
        }
      } catch {
        setInputError('Invalid base64 encoding');
        return;
      }

      addPairedSecret(trimmed);
      setSecretInput('');
      setInputError(null);
    };

    const handleConnect = async (machineId: string) => {
      if (!session) return;
      setSelectedMachineId(machineId);
      await connectToGateway(
        session.gatewayUrl,
        session.sessionToken,
        machineId,
      );
    };

    return (
      <Dialog open={modal.visible} onOpenChange={() => modal.hide()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>E2EE Settings</DialogTitle>
            <DialogDescription>
              Configure end-to-end encryption for remote access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Section 1: Gateway Authentication */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Gateway</Label>

              {isAuthenticated && session ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {session.gatewayUrl}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        User ID: {session.userId}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={logout}>
                      Logout
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="Gateway URL (e.g., https://gateway.example.com)"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                  />

                  {registrationOpen && (
                    <div className="flex gap-2 text-xs">
                      <button
                        className={`${!isSignupMode ? 'font-bold underline' : 'text-muted-foreground'}`}
                        onClick={() => setIsSignupMode(false)}
                      >
                        Login
                      </button>
                      <span className="text-muted-foreground">/</span>
                      <button
                        className={`${isSignupMode ? 'font-bold underline' : 'text-muted-foreground'}`}
                        onClick={() => setIsSignupMode(true)}
                      >
                        Sign Up
                      </button>
                    </div>
                  )}

                  <Input
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input
                    placeholder="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAuth();
                    }}
                  />
                  {isSignupMode && (
                    <Input
                      placeholder="Name (optional)"
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
                      ? 'Connecting...'
                      : isSignupMode
                        ? 'Create Account'
                        : 'Login'}
                  </Button>
                </div>
              )}
            </div>

            {/* Section 2: Device Pairing */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Device Pairing</Label>

              {/* Connection Status */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    connected ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  {connected ? 'Connected' : 'Not connected'}
                </span>
              </div>

              {hasPairedSecrets ? (
                <div className="space-y-2">
                  {pairedSecretIds.map((id, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <code className="text-xs font-mono">{id}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No paired devices. Run{' '}
                  <code className="text-xs bg-muted px-1 rounded">
                    vibe-kanban status
                  </code>{' '}
                  on your machine to get the master secret, then paste it below.
                </p>
              )}

              {/* Add Secret */}
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Paste master secret (base64)"
                  value={secretInput}
                  onChange={(e) => {
                    setSecretInput(e.target.value);
                    setInputError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePair();
                  }}
                />
                <Button onClick={handlePair} size="sm">
                  Pair
                </Button>
              </div>
              {(inputError || e2eeError) && (
                <p className="text-xs text-red-500">
                  {inputError || e2eeError}
                </p>
              )}
            </div>

            {/* Section 3: Online Machines */}
            {machines.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Online Machines</Label>
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
                          Connect
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {hasPairedSecrets && (
              <Button variant="destructive" onClick={clearSecrets}>
                Clear All Keys
              </Button>
            )}
            <Button variant="outline" onClick={() => modal.hide()}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const E2EESettingsDialog = defineModal<
  E2EESettingsDialogProps,
  void
>(E2EESettingsDialogImpl);
