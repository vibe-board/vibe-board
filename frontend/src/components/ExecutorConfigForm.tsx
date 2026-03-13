import { useMemo, useEffect, useState, useCallback } from 'react';
import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import { RJSFValidationError } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { shadcnTheme } from './rjsf';
import { BaseCodingAgent } from 'shared/types';
// Using custom shadcn/ui widgets instead of @rjsf/shadcn theme

/** Default base commands per executor (for placeholder only). Override via base_command_override to pin version. Matches Rust defaults. */
const DEFAULT_BASE_COMMAND_PLACEHOLDERS: Record<BaseCodingAgent, string> = {
  [BaseCodingAgent.AMP]: 'npx -y @sourcegraph/amp@latest',
  [BaseCodingAgent.AUGGIE]: 'npx -y @augmentcode/auggie@0.19.0',
  [BaseCodingAgent.AUTOHAND]: 'npx -y @autohandai/autohand-acp@0.2.1',
  [BaseCodingAgent.CLAUDE_CODE]: 'npx -y @anthropic-ai/claude-code@2.1.32',
  [BaseCodingAgent.CLINE]: 'npx -y cline@2.7.0',
  [BaseCodingAgent.CODEBUDDY_CODE]: 'npx -y @tencent-ai/codebuddy-code@2.62.0',
  [BaseCodingAgent.CODEX]: 'npx -y @openai/codex@0.98.0',
  [BaseCodingAgent.COPILOT]: 'npx -y @github/copilot@0.0.403',
  [BaseCodingAgent.CORUST_AGENT]: 'corust-agent',
  [BaseCodingAgent.CROW_CLI]: 'uvx crow-cli',
  [BaseCodingAgent.CURSOR_AGENT]: 'cursor-agent',
  [BaseCodingAgent.DEEPAGENTS]: 'npx -y deepagents-acp@0.1.1',
  [BaseCodingAgent.DIMCODE]: 'npx -y dimcode@0.0.17',
  [BaseCodingAgent.DROID]: 'droid exec',
  [BaseCodingAgent.FAST_AGENT]: 'uvx fast-agent-acp==0.5.11',
  [BaseCodingAgent.GEMINI]: 'npx -y @google/gemini-cli@0.27.0',
  [BaseCodingAgent.GOOSE]: 'goose',
  [BaseCodingAgent.JUNIE]: 'junie',
  [BaseCodingAgent.KILO]: 'npx -y @kilocode/cli@7.0.47',
  [BaseCodingAgent.KIMI]: 'kimi',
  [BaseCodingAgent.MINION_CODE]: 'uvx minion-code@0.1.42',
  [BaseCodingAgent.MISTRAL_VIBE]: 'mistral-vibe',
  [BaseCodingAgent.NOVA]: 'npx -y @compass-ai/nova@1.0.78',
  [BaseCodingAgent.OPENCODE]: 'npx -y opencode-ai@1.2.24',
  [BaseCodingAgent.PI_ACP]: 'npx -y pi-acp@0.0.23',
  [BaseCodingAgent.QODER]: 'npx -y @qoder-ai/qodercli@0.1.31',
  [BaseCodingAgent.QWEN_CODE]: 'npx -y @qwen-code/qwen-code@0.9.1',
  [BaseCodingAgent.STAKPAK]: 'stakpak',
};

interface ExecutorConfigFormProps {
  executor: BaseCodingAgent;
  value: unknown;
  onSubmit?: (formData: unknown) => void;
  onChange?: (formData: unknown) => void;
  onSave?: (formData: unknown) => Promise<void>;
  disabled?: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
}

import schemas from 'virtual:executor-schemas';

export function ExecutorConfigForm({
  executor,
  value,
  onSubmit,
  onChange,
  onSave,
  disabled = false,
  isSaving = false,
  isDirty = false,
}: ExecutorConfigFormProps) {
  const [formData, setFormData] = useState<unknown>(value || {});
  const [validationErrors, setValidationErrors] = useState<
    RJSFValidationError[]
  >([]);

  const schema = useMemo(() => {
    return schemas[executor];
  }, [executor]);

  // Custom handler for env field updates
  const handleEnvChange = useCallback(
    (envData: Record<string, string> | undefined) => {
      const newFormData = {
        ...(formData as Record<string, unknown>),
        env: envData,
      };
      setFormData(newFormData);
      if (onChange) {
        onChange(newFormData);
      }
    },
    [formData, onChange]
  );

  const uiSchema = useMemo(
    () => ({
      env: {
        'ui:field': 'KeyValueField',
      },
      base_command_override: {
        'ui:placeholder': DEFAULT_BASE_COMMAND_PLACEHOLDERS[executor],
      },
    }),
    [executor]
  );

  // Pass the env update handler via formContext
  const formContext = useMemo(
    () => ({
      onEnvChange: handleEnvChange,
    }),
    [handleEnvChange]
  );

  useEffect(() => {
    setFormData(value || {});
    setValidationErrors([]);
  }, [value, executor]);

  const handleChange = (event: IChangeEvent<unknown>) => {
    const newFormData = event.formData;
    setFormData(newFormData);
    if (onChange) {
      onChange(newFormData);
    }
  };

  const handleSubmit = async (event: IChangeEvent<unknown>) => {
    const submitData = event.formData;
    setValidationErrors([]);
    if (onSave) {
      await onSave(submitData);
    } else if (onSubmit) {
      onSubmit(submitData);
    }
  };

  const handleError = (errors: RJSFValidationError[]) => {
    setValidationErrors(errors);
  };

  if (!schema) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Schema not found for executor type: {executor}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-0">
          <Form
            schema={schema}
            uiSchema={uiSchema}
            formData={formData}
            formContext={formContext}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onError={handleError}
            validator={validator}
            disabled={disabled}
            liveValidate
            showErrorList={false}
            widgets={shadcnTheme.widgets}
            templates={shadcnTheme.templates}
            fields={shadcnTheme.fields}
          >
            {onSave && (
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={!isDirty || validationErrors.length > 0 || isSaving}
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Configuration
                </Button>
              </div>
            )}
          </Form>
        </CardContent>
      </Card>

      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>
                  {error.property}: {error.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
