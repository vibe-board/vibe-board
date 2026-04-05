import { FieldProps } from '@rjsf/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Plus, X } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';

type KeyValueData = Record<string, string>;

interface EnvFormContext {
  onEnvChange?: (envData: KeyValueData | undefined) => void;
}

export function KeyValueField({
  formData,
  disabled,
  readonly,
  registry,
}: FieldProps<KeyValueData>) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const formContext = registry.formContext as EnvFormContext | undefined;

  const data: KeyValueData = useMemo(() => formData ?? {}, [formData]);
  const entries = useMemo(() => Object.entries(data), [data]);

  const updateValue = useCallback(
    (newData: KeyValueData | undefined) => {
      formContext?.onEnvChange?.(newData);
    },
    [formContext],
  );

  const handleAdd = useCallback(() => {
    const trimmedKey = newKey.trim();
    if (trimmedKey) {
      updateValue({ ...data, [trimmedKey]: newValue });
      setNewKey('');
      setNewValue('');
    }
  }, [data, newKey, newValue, updateValue]);

  const handleRemove = useCallback(
    (key: string) => {
      const updated = { ...data };
      delete updated[key];
      updateValue(Object.keys(updated).length > 0 ? updated : undefined);
    },
    [data, updateValue],
  );

  const handleValueChange = useCallback(
    (key: string, value: string) => {
      updateValue({ ...data, [key]: value });
    },
    [data, updateValue],
  );

  const isDisabled = disabled || readonly;

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 items-center">
          <Input
            value={key}
            disabled
            className="flex-1 font-mono text-xs"
          />
          <Input
            value={value ?? ''}
            onChange={(e) => handleValueChange(key, e.target.value)}
            disabled={isDisabled}
            className="flex-1 font-mono text-xs"
            placeholder="Value"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleRemove(key)}
            disabled={isDisabled}
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2 items-center">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          disabled={isDisabled}
          placeholder="KEY"
          className="flex-1 font-mono text-xs"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          disabled={isDisabled}
          placeholder="value"
          className="flex-1 font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAdd}
          disabled={isDisabled || !newKey.trim()}
          className="shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
