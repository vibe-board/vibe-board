import { type Component } from 'solid-js';
import { GeneralSettings } from '@/components/settings/general';

const SettingsPage: Component = () => {
  return (
    <div class="p-6">
      <GeneralSettings />
    </div>
  );
};

export default SettingsPage;
