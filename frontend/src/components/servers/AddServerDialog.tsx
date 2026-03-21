import { useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { defineModal } from '@/lib/modals';
import { Server, Cloud } from 'lucide-react';
import { DirectServerSetup } from './DirectServerSetup';
import { E2EEServerSetup } from './E2EEServerSetup';
import type { ServerConfig } from '@/lib/servers/types';
import { useServerManager } from '@/contexts/ServerManagerContext';

type Step = 'choose-type' | 'direct' | 'e2ee';

const AddServerDialogImpl = NiceModal.create(() => {
  const modal = useModal();
  const [step, setStep] = useState<Step>('choose-type');
  const { addServer, connectToServer } = useServerManager();

  const handleClose = () => {
    modal.resolve(undefined);
    modal.hide();
  };

  const handleServerAdded = async (config: ServerConfig) => {
    await addServer(config);
    await connectToServer(config.id);
    modal.resolve(config);
    modal.hide();
  };

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      className="sm:max-w-md"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'choose-type'
              ? 'Add Server'
              : step === 'direct'
                ? 'Direct Connection'
                : 'E2EE Connection'}
          </DialogTitle>
        </DialogHeader>

        {step === 'choose-type' && (
          <div className="space-y-3 py-2">
            <button
              className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-accent transition-colors"
              onClick={() => setStep('direct')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <Server className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Direct Connection
                </p>
                <p className="text-xs text-muted-foreground">
                  Connect directly to a server by IP or hostname
                </p>
              </div>
            </button>

            <button
              className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-accent transition-colors"
              onClick={() => setStep('e2ee')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <Cloud className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  E2EE Connection
                </p>
                <p className="text-xs text-muted-foreground">
                  Connect via encrypted gateway relay
                </p>
              </div>
            </button>
          </div>
        )}

        {step === 'direct' && (
          <DirectServerSetup
            onDone={handleServerAdded}
            onBack={() => setStep('choose-type')}
          />
        )}

        {step === 'e2ee' && (
          <E2EEServerSetup
            onDone={handleServerAdded}
            onBack={() => setStep('choose-type')}
          />
        )}
      </DialogContent>
    </Dialog>
  );
});

export const AddServerDialog = defineModal<void, ServerConfig | undefined>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AddServerDialogImpl as any
);
