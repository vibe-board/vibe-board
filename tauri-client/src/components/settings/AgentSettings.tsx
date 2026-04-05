import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { useSystemInfo, useProfiles, useUpdateConfig, useUpdateProfiles } from '@/api/hooks/useConfig';
import { mobileTheme } from '@/components/rjsf';
import schemas from 'virtual:executor-schemas';
import type { BaseCodingAgent, ExecutorConfigs } from '@shared/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  BottomSheet,
  BottomSheetBody,
} from '@/components/ui/BottomSheet';
import { AGENT_LABELS } from '@/utils/executor';
import { Bot, Check, Plus, Trash2, ChevronRight } from 'lucide-react';

/** Validate configuration name: alphanumeric, underscore, hyphen, 1-40 chars */
const CONFIG_NAME_RE = /^[a-zA-Z0-9_-]{1,40}$/;

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;

// ---------------------------------------------------------------------------
// AgentConfigSheet — bottom sheet for a single agent's configurations
// ---------------------------------------------------------------------------
interface AgentConfigSheetProps {
  open: boolean;
  onClose: () => void;
  agent: BaseCodingAgent;
  executors: Record<string, Record<string, Record<string, unknown>>> | undefined;
  onSaveProfiles: (profiles: ExecutorConfigs) => Promise<void>;
  isSaving: boolean;
}

function AgentConfigSheet({
  open,
  onClose,
  agent,
  executors,
  onSaveProfiles,
  isSaving,
}: AgentConfigSheetProps) {
  const { t } = useTranslation();
  const agentConfigs = executors?.[agent as BaseCodingAgent];
  const configNames = useMemo(() => agentConfigs ? Object.keys(agentConfigs) : [], [agentConfigs]);

  const [selectedConfig, setSelectedConfig] = useState<string>(
    configNames[0] ?? 'DEFAULT',
  );
  const [formData, setFormData] = useState<unknown>({});
  const formDataRef = useRef<unknown>({});
  const [dirty, setDirty] = useState(false);

  // Create-config sub-sheet state
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newName, setNewName] = useState('');
  const [cloneFrom, setCloneFrom] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);

  // When agent or selected config changes, load form data
  useEffect(() => {
    if (!agentConfigs) return;
    const currentConfig = agentConfigs[selectedConfig] as
      | Record<string, unknown>
      | undefined;
    const inner = currentConfig?.[agent] as
      | Record<string, unknown>
      | undefined;
    const data = inner ? { ...inner } : {};
    setFormData(data);
    formDataRef.current = data;
    setDirty(false);
  }, [agent, selectedConfig, executors, agentConfigs]);

  // Reset selected config when configs list changes
  useEffect(() => {
    if (configNames.length > 0 && !configNames.includes(selectedConfig)) {
      setSelectedConfig(configNames[0]);
    }
  }, [configNames, selectedConfig]);

  // --- RJSF handlers ---
  const handleEnvChange = useCallback(
    (envData: Record<string, string> | undefined) => {
      const newData = {
        ...(formDataRef.current as Record<string, unknown>),
        env: envData,
      };
      formDataRef.current = newData;
      setFormData(newData);
      setDirty(true);
    },
    [],
  );

  const uiSchema = {
    env: { 'ui:field': 'KeyValueField' },
  };

  const formContext = { onEnvChange: handleEnvChange };

  const handleChange = (event: IChangeEvent<unknown>) => {
    formDataRef.current = event.formData;
    setFormData(event.formData);
    setDirty(true);
  };

  const handleSubmit = async (_event: IChangeEvent<unknown>) => {
    if (!executors) return;
    const submitData = formDataRef.current;
    const updated: ExecutorConfigs = {
      executors: {
        ...executors,
        [agent]: {
          ...executors[agent as BaseCodingAgent],
          [selectedConfig]: {
            [agent]: submitData,
          },
        },
      },
    };
    await onSaveProfiles(updated);
    setDirty(false);
  };

  // --- Create configuration ---
  const handleCreate = async () => {
    if (!executors || !newName.trim()) return;

    // Validate name
    if (!CONFIG_NAME_RE.test(newName.trim())) {
      setNameError(t('settings.invalidName', 'Invalid name (alphanumeric, _-, max 40)'));
      return;
    }
    if (configNames.includes(newName.trim())) {
      setNameError(t('settings.nameExists', 'Name already exists'));
      return;
    }

    const name = newName.trim();
    const agentConfigs = executors[agent as BaseCodingAgent];
    const base =
      cloneFrom && agentConfigs?.[cloneFrom]?.[agent as string]
        ? { ...(agentConfigs[cloneFrom][agent as string] as Record<string, unknown>) }
        : {};

    const updated: ExecutorConfigs = {
      executors: {
        ...executors,
        [agent]: {
          ...agentConfigs,
          [name]: { [agent]: base },
        },
      },
    };
    await onSaveProfiles(updated);
    setSelectedConfig(name);
    setShowCreateSheet(false);
    setNewName('');
    setCloneFrom('');
    setNameError(null);
  };

  // --- Delete configuration ---
  const handleDelete = async (configName: string) => {
    if (!executors) return;
    if (configNames.length <= 1) return; // keep at least one

    const confirmed = window.confirm(
      t('settings.confirmDeleteConfig', 'Delete configuration "{{name}}"?', {
        name: configName,
      }),
    );
    if (!confirmed) return;

    const agentConfigs = executors[agent as BaseCodingAgent];
    const remaining = { ...agentConfigs };
    delete remaining[configName];

    const updated: ExecutorConfigs = {
      executors: {
        ...executors,
        [agent]: remaining,
      },
    };
    await onSaveProfiles(updated);

    // If we deleted the selected config, pick the next available one
    if (selectedConfig === configName) {
      const next = Object.keys(remaining)[0] ?? 'DEFAULT';
      setSelectedConfig(next);
    }
  };

  const schema = schemas[agent];
  const configOptions = configNames.map((n) => ({ value: n, label: n }));
  const cloneOptions = [
    { value: '', label: t('settings.none', 'None') },
    ...configNames.map((n) => ({ value: n, label: n })),
  ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={AGENT_LABELS[agent] ?? agent.replace(/_/g, ' ')}
    >
      <BottomSheetBody className="space-y-4">
        {/* Configuration selector + delete + add */}
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                value={selectedConfig}
                onChange={setSelectedConfig}
                options={configOptions}
                placeholder={t('settings.selectConfig', 'Select configuration')}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCreateSheet(true)}
              title={t('settings.addConfiguration', 'Add configuration')}
            >
              <Plus className="h-4 w-4" />
            </Button>
            {configNames.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(selectedConfig)}
                disabled={isSaving}
                title={t('common.delete', 'Delete')}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>

        {/* RJSF form */}
        {schema ? (
          <Form
            key={`${agent}-${selectedConfig}`}
            schema={schema}
            uiSchema={uiSchema}
            formData={formData}
            formContext={formContext}
            onChange={handleChange}
            onSubmit={handleSubmit}
            validator={validator}
            liveValidate
            showErrorList={false}
            widgets={mobileTheme.widgets}
            templates={mobileTheme.templates}
            fields={mobileTheme.fields}
          >
            <Button
              type="submit"
              disabled={!dirty || isSaving}
              className="w-full"
            >
              {isSaving ? (
                <LoadingSpinner size="sm" />
              ) : (
                t('common.save', 'Save')
              )}
            </Button>
          </Form>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('settings.noSchema', 'No schema available for this executor type.')}
          </p>
        )}

        {/* Create sub-sheet (inline) */}
        {showCreateSheet && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="text-sm font-medium">
              {t('settings.addConfiguration', 'Add configuration')}
            </div>
            <Input
              label={t('settings.configName', 'Name')}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameError(null);
              }}
              placeholder="e.g. PLAN, FAST"
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
            <Select
              value={cloneFrom}
              onChange={setCloneFrom}
              options={cloneOptions}
              placeholder={t('settings.cloneFrom', 'Clone from (optional)')}
            />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateSheet(false);
                  setNewName('');
                  setCloneFrom('');
                  setNameError(null);
                }}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newName.trim() || isSaving}
              >
                {t('settings.create', 'Create')}
              </Button>
            </div>
          </div>
        )}
      </BottomSheetBody>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// AgentSettings — main component
// ---------------------------------------------------------------------------
export default function AgentSettings() {
  const { t } = useTranslation();
  const { data: info, isLoading: infoLoading } = useSystemInfo();
  const { isLoading: profilesLoading } = useProfiles();
  const updateConfig = useUpdateConfig();
  const updateProfiles = useUpdateProfiles();

  // --- Executor profile card state ---
  const currentProfile = info?.config?.executor_profile;
  const [selectedExecutor, setSelectedExecutor] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [dirty, setDirty] = useState(false);

  // Sync from server when not dirty
  useEffect(() => {
    if (!dirty && currentProfile) {
      setSelectedExecutor(currentProfile.executor ?? '');
      setSelectedVariant(currentProfile.variant ?? '');
    }
  }, [currentProfile, dirty]);

  const handleExecutorChange = useCallback(
    (value: string) => {
      setSelectedExecutor(value);
      // Reset variant when executor changes; keep if variant exists in new executor
      const variants = info?.executors?.[value as BaseCodingAgent];
      const keepVariant =
        variants && selectedVariant && variants[selectedVariant]
          ? selectedVariant
          : '';
      setSelectedVariant(keepVariant);
      setDirty(true);
    },
    [info, selectedVariant],
  );

  const handleVariantChange = useCallback((value: string) => {
    setSelectedVariant(value);
    setDirty(true);
  }, []);

  const handleSaveExecutor = useCallback(async () => {
    if (!info || !selectedExecutor) return;
    await updateConfig.mutateAsync({
      ...info.config,
      executor_profile: {
        executor: selectedExecutor as BaseCodingAgent,
        variant: selectedVariant || null,
      },
    });
    setDirty(false);
  }, [info, selectedExecutor, selectedVariant, updateConfig]);

  const handleDiscardExecutor = useCallback(() => {
    setSelectedExecutor(currentProfile?.executor ?? '');
    setSelectedVariant(currentProfile?.variant ?? '');
    setDirty(false);
  }, [currentProfile]);

  // --- Agent list state ---
  const agentEnabled = info?.config?.agent_enabled;
  const availableExecutors = info?.executors
    ? (Object.keys(info.executors) as BaseCodingAgent[])
    : [];

  // Config sheet state
  const [configSheetAgent, setConfigSheetAgent] = useState<BaseCodingAgent | null>(null);

  const handleToggleEnabled = useCallback(
    async (agent: BaseCodingAgent, enabled: boolean) => {
      if (!info) return;
      const currentEnabled = info.config.agent_enabled || [];
      const newEnabled = enabled
        ? [...currentEnabled, agent]
        : currentEnabled.filter((a) => a !== agent);
      await updateConfig.mutateAsync({
        ...info.config,
        agent_enabled: newEnabled,
      });
    },
    [info, updateConfig],
  );

  const handleSaveProfiles = useCallback(
    async (updated: ExecutorConfigs) => {
      await updateProfiles.mutateAsync(updated);
    },
    [updateProfiles],
  );

  // --- Render ---
  if (infoLoading || profilesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  // Executor selector options
  const executorOptions = availableExecutors.map((key) => ({
    value: key,
    label: AGENT_LABELS[key] ?? key.replace(/_/g, ' '),
  }));

  const activeExecutor =
    selectedExecutor || currentProfile?.executor || '';

  // Variant selector options for current executor
  const variantMap = info?.executors?.[activeExecutor as BaseCodingAgent];
  const variantNames = variantMap ? Object.keys(variantMap) : [];
  const variantOptions = [
    { value: '', label: `(${t('settings.default', 'Default')})` },
    ...variantNames.map((n) => ({ value: n, label: n })),
  ];

  return (
    <div className="space-y-4 p-4">
      {/* Card 1: Default Executor */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.executorType')}</CardTitle>
          <CardDescription>{t('settings.agentsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {executorOptions.length > 0 ? (
            <>
              <Select
                value={activeExecutor}
                onChange={handleExecutorChange}
                options={executorOptions}
                placeholder={t('settings.selectExecutor', 'Select executor')}
              />
              {variantNames.length > 0 && (
                <Select
                  value={selectedVariant}
                  onChange={handleVariantChange}
                  options={variantOptions}
                  placeholder={t('settings.variant', 'Configuration')}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('settings.noAgents')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Agent List */}
      {availableExecutors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.agentConfig')}</CardTitle>
            <CardDescription>
              {availableExecutors.length}{' '}
              {t('settings.agents', 'agents').toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {availableExecutors.map((agentKey) => {
                const isEnabled =
                  !agentEnabled ||
                  agentEnabled.length === 0 ||
                  agentEnabled.includes(agentKey);
                const isDefault = agentKey === currentProfile?.executor;

                return (
                  <div
                    key={agentKey}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <Checkbox
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        handleToggleEnabled(agentKey, !!checked)
                      }
                      disabled={updateConfig.isPending}
                    />
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {AGENT_LABELS[agentKey] ?? agentKey.replace(/_/g, ' ')}
                      </div>
                    </div>
                    {isDefault && (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <Check className="h-3 w-3" />
                        {t('settings.defaultAgent')}
                      </span>
                    )}
                    <button
                      className="flex items-center justify-center rounded-md p-1 hover:bg-accent"
                      onClick={() => setConfigSheetAgent(agentKey)}
                    >
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sticky save bar for executor profile card */}
      {dirty && (
        <div className="sticky bottom-20 flex items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="flex-1 text-sm text-muted-foreground">
            {t('settings.unsavedChanges')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscardExecutor}
            disabled={updateConfig.isPending}
          >
            {t('settings.discardChanges')}
          </Button>
          <Button
            size="sm"
            onClick={handleSaveExecutor}
            disabled={updateConfig.isPending}
          >
            {updateConfig.isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              t('settings.saveChanges')
            )}
          </Button>
        </div>
      )}

      {/* Agent Config BottomSheet */}
      {configSheetAgent && (
        <AgentConfigSheet
          open={!!configSheetAgent}
          onClose={() => setConfigSheetAgent(null)}
          agent={configSheetAgent}
          executors={info?.executors as unknown as ExecutorsMap}
          onSaveProfiles={handleSaveProfiles}
          isSaving={updateProfiles.isPending}
        />
      )}
    </div>
  );
}
