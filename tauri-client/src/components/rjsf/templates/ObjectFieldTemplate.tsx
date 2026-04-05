import { ObjectFieldTemplateProps } from '@rjsf/utils';

export const ObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
  const { properties, title, description } = props;

  return (
    <div className="space-y-0">
      {title && (
        <h4 className="text-sm font-semibold text-foreground mb-1">{title}</h4>
      )}
      {description && (
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
      )}
      <div className="divide-y divide-border">
        {properties.map((element) => (
          <div key={element.name}>{element.content}</div>
        ))}
      </div>
    </div>
  );
};
