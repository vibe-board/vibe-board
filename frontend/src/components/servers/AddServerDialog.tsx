import { useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { defineModal } from '@/lib/modals';
import { DirectServerSetup } from './DirectServerSetup';
import { E2EEServerSetup } from './E2EEServerSetup';
import type { ServerConfig, ServerType } from '@/lib/servers/types';
import { useServerManager } from '@/contexts/ServerManagerContext';
import { Server, Cloud } from 'lucide-react';

type Step = 'choose-type' | 'direct' | 'e2ee';

const AddServerDialogImpl = NiceModal.create(() => {
  const modal = useModal();
  const { addServer, connectToServer } = useServerManager();
  const [step, setStep] = useState<Step>('choose-type');

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

  const title =
    step === 'choose-type'
      ? 'Add Server'
      : step === 'direct'
        ? 'Direct Connection'
        : 'E2EE Gateway';

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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {step === 'choose-type' && (
          <TypeSelection onSelect={(t) => setStep(t)} />
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

function TypeSelection({ onSelect }: { onSelect: (type: ServerType) => void }) {
  return (
    <div className="grid gap-3 py-2">
      <button
        className="flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted transition-colors active:bg-muted"
        onClick={() => onSelect('direct')}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Server className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Direct Connection
          </p>
          <p className="text-xs text-muted-foreground">
            Connect to a server on your local network
          </p>
        </div>
      </button>

      <button
        className="flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted transition-colors active:bg-muted"
        onClick={() => onSelect('e2ee')}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Cloud className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">E2EE Gateway</p>
          <p className="text-xs text-muted-foreground">
            Connect via encrypted relay gateway
          </p>
        </div>
      </button>
    </div>
  );
}

export const AddServerDialog = defineModal<void, ServerConfig | undefined>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AddServerDialogImpl as any
);
