import { WidgetProps } from '@rjsf/utils';
import { Textarea } from '@/components/ui/Textarea';

export const TextareaWidget = (props: WidgetProps) => {
  const {
    id,
    value,
    disabled,
    readonly,
    onChange,
    onBlur,
    onFocus,
    placeholder,
    options,
    schema,
  } = props;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    onChange(newValue === '' ? options.emptyValue : newValue);
  };

  const handleBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (onBlur) {
      onBlur(id, event.target.value);
    }
  };

  const handleFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (onFocus) {
      onFocus(id, event.target.value);
    }
  };

  const rows =
    (options.rows as number) ||
    ((schema.title || '').toLowerCase().includes('prompt') ? 4 : 3);

  return (
    <Textarea
      id={id}
      value={value ?? ''}
      placeholder={placeholder || ''}
      disabled={disabled || readonly}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      rows={rows}
    />
  );
};
