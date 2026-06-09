import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { AlertTriangle } from 'lucide-react';
import { defineModal } from '@/lib/modals';

export interface UnpairMachineDialogProps {
  hostname: string;
}

export interface UnpairMachineResult {
  confirmed: boolean;
  clearCache: boolean;
}

const UnpairMachineDialogImpl = NiceModal.create<UnpairMachineDialogProps>(
  ({ hostname }) => {
    const modal = useModal();
    const [clearCache, setClearCache] = useState(false);

    const handleConfirm = () => {
      modal.resolve({ confirmed: true, clearCache } as UnpairMachineResult);
    };

    const handleCancel = () => {
      modal.resolve({
        confirmed: false,
        clearCache: false,
      } as UnpairMachineResult);
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <DialogTitle>Unpair machine</DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              This removes this device's pairing with{' '}
              <span className="font-medium">{hostname}</span>. You can pair it
              again afterwards with a fresh master secret. The machine itself
              and other devices are not affected.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 py-1">
            <Checkbox
              id="unpair-clear-cache"
              checked={clearCache}
              onCheckedChange={setClearCache}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="unpair-clear-cache" className="text-sm">
                Also clear cached conversation data on this device
              </Label>
              <p className="text-xs text-muted-foreground">
                Clears cached conversations for all machines on this device, not
                just this one.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              Unpair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const UnpairMachineDialog = defineModal<
  UnpairMachineDialogProps,
  UnpairMachineResult
>(UnpairMachineDialogImpl);
