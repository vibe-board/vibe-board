import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/i18n';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { useSystemInfo, useUpdateConfig } from '@/api/hooks/useConfig';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Checkbox } from '@/components/ui/Checkbox';
import { Textarea } from '@/components/ui/Textarea';
import { EditorType } from '@shared/types';

const THEME_OPTIONS = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
] as const;

const LANG_OPTIONS = [
  { value: 'BROWSER', label: 'Browser Default' },
  { value: 'EN', label: 'English' },
  { value: 'FR', label: 'Français' },
  { value: 'JA', label: '日本語' },
  { value: 'ES', label: 'Español' },
  { value: 'KO', label: '한국어' },
  { value: 'ZH_HANS', label: '简体中文' },
  { value: 'ZH_HANT', label: '繁體中文' },
] as const;

const EDITOR_TYPE_LABELS: Record<string, string> = {
  VS_CODE: 'VS Code',
  VS_CODE_INSIDERS: 'VS Code Insiders',
  CURSOR: 'Cursor',
  WINDSURF: 'Windsurf',
  INTELLI_J: 'IntelliJ',
  ZED: 'Zed',
  XCODE: 'Xcode',
  GOOGLE_ANTIGRAVITY: 'Google Antigravity',
  CUSTOM: 'Custom',
};

export default function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const theme = useUiPreferencesStore((s) => s.theme);
  const setTheme = useUiPreferencesStore((s) => s.setTheme);
  const setLanguage = useUiPreferencesStore((s) => s.setLanguage);

  const { data: config, isLoading } = useSystemInfo();
  const updateConfig = useUpdateConfig();

  const [editorType, setEditorType] = useState<string>(
    () => config?.config?.editor?.editor_type ?? EditorType.CUSTOM,
  );
  const [editorCommand, setEditorCommand] = useState(
    () => config?.config?.editor?.custom_command ?? '',
  );
  const [gitBranchPrefix, setGitBranchPrefix] = useState(
    () => config?.config?.git_branch_prefix ?? '',
  );
  const [workspaceDir, setWorkspaceDir] = useState(
    () => config?.config?.workspace_dir ?? '',
  );
  const [prAutoDescriptionEnabled, setPrAutoDescriptionEnabled] = useState(
    () => config?.config?.pr_auto_description_enabled ?? false,
  );
  const [prAutoDescriptionPrompt, setPrAutoDescriptionPrompt] = useState(
    () => config?.config?.pr_auto_description_prompt ?? '',
  );
  const [commitMessageEnabled, setCommitMessageEnabled] = useState(
    () => config?.config?.commit_message_enabled ?? false,
  );
  const [commitMessagePrompt, setCommitMessagePrompt] = useState(
    () => config?.config?.commit_message_prompt ?? '',
  );
  const [commitMessageSingleCommit, setCommitMessageSingleCommit] = useState(
    () => config?.config?.commit_message_single_commit ?? false,
  );
  const [dirty, setDirty] = useState(false);

  const handleThemeChange = useCallback(
    (value: string) => {
      setTheme(value as 'light' | 'dark' | 'system');
      if (value === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (value === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        const prefersDark = window.matchMedia(
          '(prefers-color-scheme: dark)',
        ).matches;
        document.documentElement.classList.toggle('dark', prefersDark);
      }
    },
    [setTheme],
  );

  const handleLanguageChange = useCallback(
    async (value: string) => {
      await changeLanguage(value);
      setLanguage(value);
    },
    [setLanguage],
  );

  const handleEditorTypeChange = useCallback(
    (value: string) => {
      setEditorType(value);
      setDirty(true);
    },
    [],
  );

  const handleEditorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditorCommand(e.target.value);
      setDirty(true);
    },
    [],
  );

  const handleGitBranchPrefixChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setGitBranchPrefix(e.target.value);
      setDirty(true);
    },
    [],
  );

  const handleWorkspaceDirChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setWorkspaceDir(e.target.value);
      setDirty(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!config) return;
    await updateConfig.mutateAsync({
      ...config.config,
      editor: {
        ...config.config.editor,
        editor_type: editorType as EditorType,
        custom_command: editorCommand || null,
      },
      git_branch_prefix: gitBranchPrefix,
      workspace_dir: workspaceDir || null,
      pr_auto_description_enabled: prAutoDescriptionEnabled,
      pr_auto_description_prompt: prAutoDescriptionPrompt || null,
      commit_message_enabled: commitMessageEnabled,
      commit_message_prompt: commitMessagePrompt || null,
      commit_message_single_commit: commitMessageSingleCommit,
    });
    setDirty(false);
  }, [
    config,
    editorType,
    editorCommand,
    gitBranchPrefix,
    workspaceDir,
    prAutoDescriptionEnabled,
    prAutoDescriptionPrompt,
    commitMessageEnabled,
    commitMessagePrompt,
    commitMessageSingleCommit,
    updateConfig,
  ]);

  const handleDiscard = useCallback(() => {
    setEditorType(config?.config?.editor?.editor_type ?? EditorType.CUSTOM);
    setEditorCommand(config?.config?.editor?.custom_command ?? '');
    setGitBranchPrefix(config?.config?.git_branch_prefix ?? '');
    setWorkspaceDir(config?.config?.workspace_dir ?? '');
    setPrAutoDescriptionEnabled(config?.config?.pr_auto_description_enabled ?? false);
    setPrAutoDescriptionPrompt(config?.config?.pr_auto_description_prompt ?? '');
    setCommitMessageEnabled(config?.config?.commit_message_enabled ?? false);
    setCommitMessagePrompt(config?.config?.commit_message_prompt ?? '');
    setCommitMessageSingleCommit(config?.config?.commit_message_single_commit ?? false);
    setDirty(false);
  }, [config]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance')}</CardTitle>
          <CardDescription>{t('settings.appearanceDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settings.theme')}</label>
            <Select
              value={theme}
              onChange={handleThemeChange}
              options={THEME_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('settings.language')}
            </label>
            <Select
              value={i18n.language}
              onChange={handleLanguageChange}
              options={[...LANG_OPTIONS]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.editor')}</CardTitle>
          <CardDescription>{t('settings.editorDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('settings.editorType', 'Editor Type')}
            </label>
            <Select
              value={editorType}
              onChange={handleEditorTypeChange}
              options={Object.values(EditorType).map((et) => ({
                value: et,
                label: EDITOR_TYPE_LABELS[et] ?? et,
              }))}
            />
          </div>
          <Input
            label={t('settings.executor')}
            value={editorCommand}
            onChange={handleEditorChange}
            placeholder={t('settings.editorPlaceholder')}
          />
        </CardContent>
      </Card>

      {/* Pull Requests */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.pullRequests', 'Pull Requests')}</CardTitle>
          <CardDescription>
            {t('settings.pullRequestsDesc', 'Auto-generate PR descriptions')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Checkbox
            label={t('settings.prAutoDescription', 'Auto Description')}
            checked={prAutoDescriptionEnabled}
            onCheckedChange={(checked) => {
              setPrAutoDescriptionEnabled(checked);
              setDirty(true);
            }}
          />
          {prAutoDescriptionEnabled && (
            <Textarea
              label={t('settings.prCustomPrompt', 'Custom Prompt')}
              value={prAutoDescriptionPrompt}
              onChange={(e) => {
                setPrAutoDescriptionPrompt(e.target.value);
                setDirty(true);
              }}
              placeholder={t(
                'settings.prPromptPlaceholder',
                'Custom prompt for PR descriptions...',
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* Commit Messages */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.commitMessage', 'Commit Messages')}</CardTitle>
          <CardDescription>
            {t('settings.commitMessageDesc', 'Auto-generate commit messages')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Checkbox
            label={t('settings.commitAutoMessage', 'Auto Commit Message')}
            checked={commitMessageEnabled}
            onCheckedChange={(checked) => {
              setCommitMessageEnabled(checked);
              setDirty(true);
            }}
          />
          {commitMessageEnabled && (
            <>
              <Textarea
                label={t('settings.commitCustomPrompt', 'Custom Prompt')}
                value={commitMessagePrompt}
                onChange={(e) => {
                  setCommitMessagePrompt(e.target.value);
                  setDirty(true);
                }}
                placeholder={t(
                  'settings.commitPromptPlaceholder',
                  'Custom prompt for commit messages...',
                )}
              />
              <Checkbox
                label={t('settings.commitSingleCommit', 'Single Commit Mode')}
                checked={commitMessageSingleCommit}
                onCheckedChange={(checked) => {
                  setCommitMessageSingleCommit(checked);
                  setDirty(true);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Git */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.git')}</CardTitle>
          <CardDescription>{t('settings.gitDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label={t('settings.branchPrefix')}
            value={gitBranchPrefix}
            onChange={handleGitBranchPrefixChange}
            placeholder="feature/"
          />
          <Input
            label={t('settings.workspaceDir')}
            value={workspaceDir}
            onChange={handleWorkspaceDirChange}
            placeholder="/path/to/workspaces"
          />
        </CardContent>
      </Card>

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky bottom-20 flex items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="flex-1 text-sm text-muted-foreground">
            {t('settings.unsavedChanges')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={updateConfig.isPending}
          >
            {t('settings.discardChanges')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
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
    </div>
  );
}
