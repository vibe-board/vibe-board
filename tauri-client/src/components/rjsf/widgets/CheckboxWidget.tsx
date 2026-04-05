import { WidgetProps } from '@rjsf/utils';
import { Checkbox } from '@/components/ui/Checkbox';

export const CheckboxWidget = (props: WidgetProps) => {
  const { id, value, disabled, readonly, onChange } = props;

  const handleChange = (checked: boolean) => {
    onChange(checked);
  };

  const checked = Boolean(value);

  return (
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={handleChange}
      disabled={disabled || readonly}
    />
  );
};
