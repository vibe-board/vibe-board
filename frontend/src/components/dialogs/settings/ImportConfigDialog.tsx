import { useRef, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileUp, Loader2, Upload } from 'lucide-react';

import { defineModal } from '@/lib/modals';
import { configTransferApi, type ConfigExportEnvelope } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUserSystem } from '@/components/ConfigProvider';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';

const CURRENT_EXPORT_VERSION = 1;

const SECTION_KEYS = [
  'config',
  'profiles',
  'gateway_credentials',
  'ui_preferences',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

export type ImportConfigResult =
  | { action: 'imported' }
  | { action: 'canceled' };

const ImportConfigDialogImpl = NiceModal.create<Record<string, never>>(() => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const { reloadSystem } = useUserSystem();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileData, setFileData] = useState<ConfigExportEnvelope | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    type: 'success' | 'partial' | 'error';
    message: string;
  } | null>(null);
  const [selected, setSelected] = useState<Record<SectionKey, boolean>>({
    config: true,
    profiles: true,
    gateway_credentials: false,
    ui_preferences: true,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (
          !data.export_version ||
          !data.sections ||
          typeof data.sections !== 'object'
        ) {
          setParseError(
            t('settings.general.configTransfer.import.invalidFile')
          );
          setFileData(null);
          return;
        }
        if (data.export_version > CURRENT_EXPORT_VERSION) {
          setParseError(
            t('settings.general.configTransfer.import.unsupportedVersion')
          );
          setFileData(null);
          return;
        }
        setFileData(data as ConfigExportEnvelope);
        // Set selection defaults: all checked except gateway_credentials
        const newSelected: Record<SectionKey, boolean> = {
          config: false,
          profiles: false,
          gateway_credentials: false,
          ui_preferences: false,
        };
        for (const key of SECTION_KEYS) {
          if (data.sections[key] != null) {
            newSelected[key] = key !== 'gateway_credentials';
          }
        }
        setSelected(newSelected);
      } catch {
        setParseError(t('settings.general.configTransfer.import.invalidFile'));
        setFileData(null);
      }
    };
    reader.readAsText(file);
  };

  const availableSections = fileData
    ? SECTION_KEYS.filter((key) => fileData.sections[key] != null)
    : [];

  const hasSelection = availableSections.some((key) => selected[key]);

  const handleImport = async () => {
    if (!fileData) return;
    setImporting(true);
    setResult(null);

    try {
      // Separate backend and frontend sections
      const backendSections: Record<string, unknown> = {};
      let importUiPrefs = false;

      for (const key of availableSections) {
        if (!selected[key]) continue;
        if (key === 'ui_preferences') {
          importUiPrefs = true;
        } else {
          backendSections[key] = fileData.sections[key];
        }
      }

      // Import backend sections
      const errors: string[] = [];
      if (Object.keys(backendSections).length > 0) {
        const importResult =
          await configTransferApi.importConfig(backendSections);
        for (const [section, res] of Object.entries(importResult.results)) {
          if (res.status === 'error') {
            errors.push(`${section}: ${res.message}`);
          }
        }
      }

      // Import UI preferences
      if (importUiPrefs && fileData.sections.ui_preferences) {
        const prefs = fileData.sections.ui_preferences as Record<
          string,
          unknown
        >;
        useUiPreferencesStore.setState(prefs);
      }

      // Reload system config
      await reloadSystem();

      if (errors.length > 0) {
        setResult({
          type: 'partial',
          message: `${t('settings.general.configTransfer.import.partialSuccess')} ${errors.join('; ')}`,
        });
      } else {
        setResult({
          type: 'success',
          message: t('settings.general.configTransfer.import.success'),
        });
        setTimeout(() => modal.resolve({ action: 'imported' }), 1500);
        setTimeout(() => modal.hide(), 1500);
      }
    } catch {
      setResult({
        type: 'error',
        message: t('settings.general.configTransfer.import.error'),
      });
    } finally {
      setImporting(false);
    }
  };

  const handleCancel = () => {
    modal.resolve({ action: 'canceled' } as ImportConfigResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) handleCancel();
  };

  const tSection = (key: SectionKey) =>
    t(`settings.general.configTransfer.export.sections.${key}`);

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('settings.general.configTransfer.import.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="mr-2 h-4 w-4" />
              {fileName ??
                t('settings.general.configTransfer.import.selectFile')}
            </Button>
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Section checkboxes */}
          {fileData && !parseError && (
            <>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.configTransfer.import.selectLabel')}
              </p>
              <div className="space-y-3">
                {availableSections.map((key) => (
                  <div key={key} className="flex items-center space-x-3">
                    <Checkbox
                      id={`import-${key}`}
                      checked={selected[key]}
                      onCheckedChange={(checked: boolean) =>
                        setSelected((s) => ({ ...s, [key]: checked }))
                      }
                    />
                    <Label htmlFor={`import-${key}`} className="cursor-pointer">
                      {tSection(key)}
                    </Label>
                  </div>
                ))}
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('settings.general.configTransfer.import.warning')}
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* Result feedback */}
          {result && (
            <Alert
              variant={result.type === 'error' ? 'destructive' : 'default'}
            >
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('common:buttons.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              !fileData || !hasSelection || importing || parseError != null
            }
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {t('settings.general.configTransfer.import.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ImportConfigDialog = defineModal<
  Record<string, never>,
  ImportConfigResult
>(ImportConfigDialogImpl);
