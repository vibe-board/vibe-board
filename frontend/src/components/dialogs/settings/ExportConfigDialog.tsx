import { useEffect, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';

import { defineModal, type NoProps } from '@/lib/modals';
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
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';

const CURRENT_EXPORT_VERSION = 1;

const SECTION_KEYS = [
  'config',
  'profiles',
  'gateway_credentials',
  'ui_preferences',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

// Data-only fields from useUiPreferencesStore to export
const UI_PREFERENCE_FIELDS = [
  'repoActions',
  'expanded',
  'contextBarPosition',
  'paneSizes',
  'collapsedPaths',
  'fileSearchRepoId',
  'layoutMode',
  'isLeftSidebarVisible',
  'isRightSidebarVisible',
  'isTerminalVisible',
  'workspacePanelStates',
  'kanbanProjectViewSelections',
  'kanbanProjectViewPreferences',
  'workspaceFilters',
  'kanbanViewMode',
  'listViewStatusFilter',
] as const;

function getUiPreferencesData(): Record<string, unknown> {
  const state = useUiPreferencesStore.getState();
  const data: Record<string, unknown> = {};
  for (const field of UI_PREFERENCE_FIELDS) {
    data[field] = state[field];
  }
  return data;
}

const ExportConfigDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const [backendData, setBackendData] = useState<ConfigExportEnvelope | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<SectionKey, boolean>>({
    config: true,
    profiles: true,
    gateway_credentials: true,
    ui_preferences: true,
  });

  useEffect(() => {
    if (modal.visible) {
      setLoading(true);
      configTransferApi
        .exportConfig()
        .then((data) => {
          setBackendData(data);
          // If gateway_credentials not in response, uncheck it
          if (!data.sections.gateway_credentials) {
            setSelected((s) => ({ ...s, gateway_credentials: false }));
          }
        })
        .catch(() => setBackendData(null))
        .finally(() => setLoading(false));
    }
  }, [modal.visible]);

  const availableSections = SECTION_KEYS.filter((key) => {
    if (key === 'ui_preferences') return true;
    return backendData?.sections[key] != null;
  });

  const hasSelection = availableSections.some((key) => selected[key]);

  const handleExport = () => {
    if (!backendData) return;

    const envelope: ConfigExportEnvelope = {
      export_version: CURRENT_EXPORT_VERSION,
      exported_at: backendData.exported_at,
      source_app_version: backendData.source_app_version,
      sections: {},
    };

    for (const key of availableSections) {
      if (!selected[key]) continue;
      if (key === 'ui_preferences') {
        envelope.sections[key] = getUiPreferencesData();
      } else {
        envelope.sections[key] = backendData.sections[key];
      }
    }

    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibe-board-config-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);

    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) modal.hide();
  };

  const tSection = (key: SectionKey) =>
    t(`settings.general.configTransfer.export.sections.${key}`);
  const tSectionDesc = (key: SectionKey) =>
    t(`settings.general.configTransfer.export.sections.${key}Desc`);

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('settings.general.configTransfer.export.title')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.general.configTransfer.export.selectLabel')}
            </p>
            <div className="space-y-3">
              {availableSections.map((key) => (
                <div key={key} className="flex items-start space-x-3">
                  <Checkbox
                    id={`export-${key}`}
                    checked={selected[key]}
                    onCheckedChange={(checked: boolean) =>
                      setSelected((s) => ({ ...s, [key]: checked }))
                    }
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`export-${key}`} className="cursor-pointer">
                      {tSection(key)}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {tSectionDesc(key)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => modal.hide()}>
            {t('common:buttons.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleExport} disabled={loading || !hasSelection}>
            <Download className="mr-2 h-4 w-4" />
            {t('settings.general.configTransfer.export.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ExportConfigDialog = defineModal<Record<string, never>, void>(
  ExportConfigDialogImpl
);
