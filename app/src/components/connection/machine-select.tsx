import { For, type Component } from 'solid-js';
import { cn } from '@/lib/cn';
import { Monitor, Smartphone } from 'lucide-solid';

interface Machine {
  id: string;
  hostname: string;
  platform: string;
}

interface MachineSelectProps {
  machines: Machine[];
  onSelect: (machineId: string) => void;
}

export const MachineSelect: Component<MachineSelectProps> = (props) => {
  return (
    <div class="space-y-3">
      <h3 class="text-lg font-semibold text-foreground">Select Machine</h3>
      <p class="text-sm text-muted">Choose which machine to connect to.</p>
      <div class="space-y-1">
        <For each={props.machines}>
          {(machine) => (
            <button
              class="flex items-center gap-3 w-full rounded-lg px-3 py-3 hover:bg-surface-2 transition-colors text-left"
              onClick={() => props.onSelect(machine.id)}
            >
              {machine.platform.includes('mobile') ? <Smartphone class="h-5 w-5 text-muted" /> : <Monitor class="h-5 w-5 text-muted" />}
              <div>
                <div class="text-sm font-medium text-foreground">{machine.hostname}</div>
                <div class="text-xs text-muted">{machine.platform}</div>
              </div>
            </button>
          )}
        </For>
      </div>
    </div>
  );
};
