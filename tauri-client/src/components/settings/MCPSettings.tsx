import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSystemInfo, useMcpConfig, useUpdateMcpConfig } from '@/api/hooks/useConfig';
import type { BaseCodingAgent } from '@shared/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Server, Trash2, Plus } from 'lucide-react';

export default function MCPSettings() {
  const { t } = useTranslation();
  const { data: info, isLoading: infoLoading } = useSystemInfo();
  const updateMcpConfig = useUpdateMcpConfig();

  const availableExecutors = info?.executors
    ? (Object.keys(info.executors) as BaseCodingAgent[])
    : [];

  const defaultExecutor =
    info?.config?.executor_profile?.executor ?? availableExecutors[0] ?? '';

  const [selectedExecutor, setSelectedExecutor] = useState<string>(defaultExecutor);
  const { data: mcpResponse, isLoading: mcpLoading } =
    useMcpConfig(selectedExecutor);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingJson, setEditingJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const isLoading = infoLoading || mcpLoading;

  const handleAddServer = useCallback(async () => {
    if (!editingName.trim() || !selectedExecutor) return;
    try {
      JSON.parse(editingJson);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
      return;
    }

    const currentServers = mcpResponse?.mcp_config?.servers ?? {};
    await updateMcpConfig.mutateAsync({
      executor: selectedExecutor,
      body: {
        servers: {
          ...currentServers,
          [editingName]: JSON.parse(editingJson),
        },
      },
    });
    setEditingName('');
    setEditingJson('');
    setShowAddForm(false);
  }, [editingName, editingJson, selectedExecutor, mcpResponse, updateMcpConfig]);

  const handleRemoveServer = useCallback(
    async (name: string) => {
      if (!selectedExecutor) return;
      const currentServers = { ...(mcpResponse?.mcp_config?.servers ?? {}) };
      delete currentServers[name];
      await updateMcpConfig.mutateAsync({
        executor: selectedExecutor,
        body: { servers: currentServers },
      });
    },
    [selectedExecutor, mcpResponse, updateMcpConfig],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  const servers = mcpResponse?.mcp_config?.servers ?? {};
  const serverEntries = Object.entries(servers);
  const executorOptions = availableExecutors.map((key) => ({
    value: key,
    label: key.replace(/_/g, ' '),
  }));

  return (
    <div className="space-y-4 p-4">
      {/* Executor selector */}
      {executorOptions.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.executorType')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedExecutor}
              onChange={setSelectedExecutor}
              options={executorOptions}
            />
          </CardContent>
        </Card>
      )}

      {/* Server list */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mcpServers')}</CardTitle>
          <CardDescription>{t('settings.mcpDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {serverEntries.length > 0 ? (
            <div className="space-y-2">
              {serverEntries.map(([name]) => (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{name}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveServer(name)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`${t('settings.removeMcpServer')} ${name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('settings.noMcpServers')}
            </p>
          )}

          {!showAddForm && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('settings.addMcpServer')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Add server form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.addMcpServer')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t('settings.mcpServerName')}
              </label>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder={t('settings.mcpServerNamePlaceholder')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t('settings.mcpConfig')}
              </label>
              <textarea
                value={editingJson}
                onChange={(e) => {
                  setEditingJson(e.target.value);
                  setJsonError(null);
                }}
                placeholder={t('settings.mcpConfigPlaceholder')}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
              {jsonError && (
                <p className="text-xs text-destructive">{jsonError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingName('');
                  setEditingJson('');
                  setJsonError(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleAddServer}
                disabled={
                  updateMcpConfig.isPending ||
                  !editingName.trim() ||
                  !editingJson.trim()
                }
              >
                {updateMcpConfig.isPending ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  t('common.save')
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
