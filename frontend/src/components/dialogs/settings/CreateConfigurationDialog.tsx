import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

export interface ConfigInfo {
  name: string;
  inheritFrom?: string;
}

export interface CreateConfigurationDialogProps {
  executorType: string;
  existingConfigs: string[];
  /** Per-config inheritance info, keyed by config name. */
  configInfos?: ConfigInfo[];
}

export type CreateConfigurationResult = {
  action: 'created' | 'canceled';
  configName?: string;
  cloneFrom?: string | null;
  inheritFrom?: string | null;
};

const CreateConfigurationDialogImpl =
  NiceModal.create<CreateConfigurationDialogProps>(
    ({ executorType, existingConfigs, configInfos }) => {
      const modal = useModal();
      const [configName, setConfigName] = useState('');
      const [cloneFrom, setCloneFrom] = useState<string | null>(null);
      const [creationMode, setCreationMode] = useState<
        'blank' | 'clone' | 'inherit'
      >('blank');
      const [error, setError] = useState<string | null>(null);

      useEffect(() => {
        // Reset form when dialog opens
        if (modal.visible) {
          setConfigName('');
          setCloneFrom(null);
          setCreationMode('blank');
          setError(null);
        }
      }, [modal.visible]);

      const validateConfigName = (name: string): string | null => {
        const trimmedName = name.trim();
        if (!trimmedName) return 'Configuration name cannot be empty';
        if (trimmedName.length > 40)
          return 'Configuration name must be 40 characters or less';
        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
          return 'Configuration name can only contain letters, numbers, underscores, and hyphens';
        }
        if (existingConfigs.includes(trimmedName)) {
          return 'A configuration with this name already exists';
        }
        return null;
      };

      const handleCreate = () => {
        const validationError = validateConfigName(configName);
        if (validationError) {
          setError(validationError);
          return;
        }

        modal.resolve({
          action: 'created',
          configName: configName.trim(),
          cloneFrom: creationMode === 'clone' ? cloneFrom : null,
          inheritFrom: creationMode === 'inherit' ? cloneFrom : null,
        } as CreateConfigurationResult);
        modal.hide();
      };

      const handleCancel = () => {
        modal.resolve({ action: 'canceled' } as CreateConfigurationResult);
        modal.hide();
      };

      const handleOpenChange = (open: boolean) => {
        if (!open) {
          handleCancel();
        }
      };

      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Configuration</DialogTitle>
              <DialogDescription>
                Add a new configuration for the {executorType} executor.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="config-name">Configuration Name</Label>
                <Input
                  id="config-name"
                  value={configName}
                  onChange={(e) => {
                    setConfigName(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g., PRODUCTION, DEVELOPMENT"
                  maxLength={40}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Creation Mode</Label>
                <Select
                  value={creationMode}
                  onValueChange={(value) => {
                    const mode = value as 'blank' | 'clone' | 'inherit';
                    setCreationMode(mode);
                    if (mode === 'blank') {
                      setCloneFrom(null);
                    } else if (mode === 'inherit' && cloneFrom) {
                      // Clear selection if it already inherits (not eligible)
                      const info = configInfos?.find(
                        (c) => c.name === cloneFrom
                      );
                      if (info?.inheritFrom) {
                        setCloneFrom(null);
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blank">Start blank</SelectItem>
                    <SelectItem value="clone">Clone from existing</SelectItem>
                    <SelectItem value="inherit">
                      Inherit from existing
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {creationMode !== 'blank' && (
                <div className="space-y-2">
                  <Label htmlFor="source-config">
                    {creationMode === 'clone' ? 'Clone from' : 'Inherit from'}
                  </Label>
                  <Select
                    value={cloneFrom || ''}
                    onValueChange={(value) => setCloneFrom(value || null)}
                  >
                    <SelectTrigger id="source-config">
                      <SelectValue placeholder="Select a configuration" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingConfigs.map((configuration) => {
                        const info = configInfos?.find(
                          (c) => c.name === configuration
                        );
                        const alreadyInherits = !!info?.inheritFrom;
                        // In inherit mode, configs that already inherit cannot be selected
                        const isDisabled =
                          creationMode === 'inherit' && alreadyInherits;
                        return (
                          <SelectItem
                            key={configuration}
                            value={configuration}
                            disabled={isDisabled}
                          >
                            {configuration}
                            {info?.inheritFrom && (
                              <span className="ml-2 text-xs text-info">
                                ← {info.inheritFrom}
                              </span>
                            )}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!configName.trim()}>
                Create Configuration
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

export const CreateConfigurationDialog = defineModal<
  CreateConfigurationDialogProps,
  CreateConfigurationResult
>(CreateConfigurationDialogImpl);
