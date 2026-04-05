import { WidgetProps } from '@rjsf/utils';
import { Select } from '@/components/ui/Select';

export const SelectWidget = (props: WidgetProps) => {
  const {
    value,
    disabled,
    readonly,
    onChange,
    options,
    schema,
    placeholder,
  } = props;

  const { enumOptions } = options;

  const handleChange = (newValue: string) => {
    const finalValue = newValue === '__null__' ? options.emptyValue : newValue;
    onChange(finalValue);
  };

  // Convert enumOptions to the format expected by our Select component
  const selectOptions = (enumOptions || []).map((opt) => ({
    value: String(opt.value),
    label: opt.label,
  }));

  // Handle nullable types
  const isNullable = Array.isArray(schema.type) && schema.type.includes('null');
  const allOptions = isNullable
    ? [
        { value: '__null__', label: 'Not specified' },
        ...selectOptions.filter((opt) => opt.value !== 'null'),
      ]
    : selectOptions;

  return (
    <Select
      value={value === null ? '__null__' : (value ?? '')}
      onChange={handleChange}
      disabled={disabled || readonly}
      placeholder={placeholder || 'Select an option...'}
      options={allOptions}
    />
  );
};
