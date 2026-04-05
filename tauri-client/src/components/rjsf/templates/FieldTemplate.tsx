import { FieldTemplateProps } from '@rjsf/utils';

export const FieldTemplate = (props: FieldTemplateProps) => {
  const {
    children,
    rawErrors = [],
    rawHelp,
    rawDescription,
    label,
    required,
    schema,
  } = props;

  // Objects render their children directly (no wrapping)
  if (schema.type === 'object') {
    return <>{children}</>;
  }

  return (
    <div className="py-3 space-y-1.5">
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}

      {rawDescription && (
        <p className="text-xs text-muted-foreground">{rawDescription}</p>
      )}

      {children}

      {rawHelp && (
        <p className="text-xs text-muted-foreground">{rawHelp}</p>
      )}

      {rawErrors.length > 0 && (
        <div className="space-y-0.5">
          {rawErrors.map((error, index) => (
            <p key={index} className="text-xs text-destructive">{error}</p>
          ))}
        </div>
      )}
    </div>
  );
};
