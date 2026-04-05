import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  ShieldCheck,
  ShieldOff,
  Monitor,
  Unplug,
  LogOut,
} from 'lucide-react';
import { useGateway } from '@/contexts/GatewayContext';

export default function E2EESettings() {
  const { t } = useTranslation();
  const {
    phase,
    gatewayUrl,
    session,
    machines,
    selectedMachineId,
    connectionError,
    pairMachine,
    isMachinePaired,
    selectMachine,
    disconnectMachine,
    logout,
    pairError,
  } = useGateway();

  // Pairing form state
  const [pairingMachineId, setPairingMachineId] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState('');
  const [localPairError, setLocalPairError] = useState<string | null>(null);

  const isGatewayReady = phase === 'ready';
  const isGatewayConnected =
    phase === 'ready' || phase === 'machine_select' || phase === 'connecting';

  const handlePair = useCallback(
    (machineId: string) => {
      if (!secretInput.trim()) return;
      try {
        pairMachine(machineId, secretInput.trim());
        setSecretInput('');
        setPairingMachineId(null);
        setLocalPairError(null);
      } catch (e) {
        setLocalPairError(
          e instanceof Error ? e.message : 'Invalid master secret'
        );
      }
    },
    [secretInput, pairMachine]
  );

  return (
    <div className="space-y-4 p-4">
      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.e2eeStatus', 'E2EE Status')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {isGatewayReady ? (
              <>
                <ShieldCheck className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm font-medium">
                    {t('settings.e2eeEnabled', 'E2EE Enabled')}
                  </p>
                  {selectedMachineId && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'settings.e2eeConnectedTo',
                        'Connected to {{machine}}',
                        {
                          machine:
                            machines.find(
                              (m) => m.machine_id === selectedMachineId
                            )?.hostname || selectedMachineId,
                        }
                      )}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <ShieldOff className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {t('settings.e2eeDisabled', 'E2EE Disabled')}
                  </p>
                  {phase === 'connecting' && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'settings.e2eeConnecting',
                        'Connecting...'
                      )}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gateway Session */}
      {isGatewayConnected && session && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('settings.e2eeGateway', 'Gateway')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{gatewayUrl}</p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.e2eeUserId', 'User ID')}: {session.userId}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  disconnectMachine();
                  logout();
                }}
              >
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                {t('settings.e2eeSignOut', 'Sign out')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Machines */}
      {isGatewayConnected && machines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('settings.e2eeMachines', 'Machines')}
            </CardTitle>
            <CardDescription>
              {t(
                'settings.e2eeMachinesDesc',
                'Pair and connect to your machines.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {machines.map((m) => {
              const paired = isMachinePaired(m.machine_id);
              const isSelected = selectedMachineId === m.machine_id;
              const isPairing = pairingMachineId === m.machine_id;
              const hostname = m.hostname || m.machine_id;
              const portSuffix = m.port > 0 ? `:${m.port}` : '';

              return (
                <div
                  key={m.machine_id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {hostname}
                          {portSuffix && (
                            <span className="opacity-50">{portSuffix}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          {m.platform && (
                            <span className="text-xs text-muted-foreground">
                              {m.platform}
                            </span>
                          )}
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                              paired ? 'bg-green-500' : 'bg-muted-foreground/30'
                            }`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {paired
                              ? t('settings.e2eePaired', 'Paired')
                              : t('settings.e2eeNotPaired', 'Not paired')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSelected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={disconnectMachine}
                        >
                          <Unplug className="mr-1 h-3.5 w-3.5" />
                          {t('settings.e2eeDisconnect', 'Disconnect')}
                        </Button>
                      ) : paired ? (
                        <Button
                          size="sm"
                          onClick={() => selectMachine(m.machine_id)}
                          disabled={phase === 'connecting'}
                        >
                          {t('settings.e2eeConnect', 'Connect')}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPairingMachineId(isPairing ? null : m.machine_id);
                            setSecretInput('');
                            setLocalPairError(null);
                          }}
                        >
                          {isPairing
                            ? t('settings.e2eeCancel', 'Cancel')
                            : t('settings.e2eePair', 'Pair')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Inline pair form */}
                  {isPairing && !paired && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      <Input
                        type="text"
                        value={secretInput}
                        onChange={(e) => setSecretInput(e.target.value)}
                        placeholder={t(
                          'settings.e2eeSecretPlaceholder',
                          'Paste base64 master secret...'
                        )}
                        className="font-mono text-xs"
                        autoFocus
                      />
                      {(localPairError || pairError) && (
                        <p className="text-xs text-destructive">
                          {localPairError || pairError}
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!secretInput.trim()}
                        onClick={() => handlePair(m.machine_id)}
                      >
                        {t('settings.e2eePairMachine', 'Pair Machine')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Connection error */}
      {connectionError && (
        <Card>
          <CardContent>
            <p className="text-sm text-destructive">{connectionError}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
