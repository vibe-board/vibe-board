import { RegistryFieldsType, RegistryWidgetsType } from '@rjsf/utils';
import {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
} from './widgets';
import { FieldTemplate, ObjectFieldTemplate } from './templates';
import { KeyValueField } from './fields';

export const customWidgets: RegistryWidgetsType = {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TextareaWidget,
  textarea: TextareaWidget,
};

export const customTemplates = {
  FieldTemplate,
  ObjectFieldTemplate,
};

export const customFields: RegistryFieldsType = {
  KeyValueField,
};

export const mobileTheme = {
  widgets: customWidgets,
  templates: customTemplates,
  fields: customFields,
};
