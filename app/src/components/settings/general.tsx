import type { Component } from 'solid-js';
import { useTheme } from '@/stores/theme';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export const GeneralSettings: Component = () => {
  const { setTheme, isDark } = useTheme();

  return (
    <div class="max-w-lg space-y-6">
      <div>
        <h2 class="text-lg font-semibold text-foreground">General</h2>
        <p class="text-sm text-muted mt-1">
          App preferences and configuration
        </p>
      </div>
      <Separator />
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-foreground">Dark Mode</div>
          <div class="text-xs text-muted">Toggle dark theme</div>
        </div>
        <Switch
          checked={isDark()}
          onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        />
      </div>
    </div>
  );
};
