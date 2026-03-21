import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { defineModal } from '@/lib/modals';
import { DirectServerSetup } from './DirectServerSetup';
import type { ServerConfig } from '@/lib/servers/types';
import { useServerManager } from '@/contexts/ServerManagerContext';

const AddServerDialogImpl = NiceModal.create(() => {
  const modal = useModal();
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
          <DialogTitle>Add Server</DialogTitle>
        </DialogHeader>

        <DirectServerSetup
          onDone={handleServerAdded}
          onBack={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
});

export const AddServerDialog = defineModal<void, ServerConfig | undefined>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AddServerDialogImpl as any
);
