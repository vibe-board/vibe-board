// frontend/src/components/tabs/GatewayHomeTab.tsx
import { useEffect, useState } from 'react';
import {
  ChevronDown,
  LogOut,
  Wifi,
  WifiOff,
  Monitor,
  AlertCircle,
} from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';
import { MachinePairingForm } from './MachinePairingForm';
import type { GatewayNode } from '@/lib/connections/gatewayNode';
import type { MachineStatus } from '@/lib/e2ee';

export function GatewayHomeTab({ gwNode }: { gwNode: GatewayNode }) {
  const { logoutConnection } = useConnectionStore();
  const [, force] = useState(0);
  useEffect(() => gwNode.onChange(() => force((t) => t + 1)), [gwNode]);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Machines</h2>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded text-foreground/70 hover:text-foreground"
          onClick={() => logoutConnection(gwNode.connectionId)}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {gwNode.machines.length === 0 ? (
        <EmptyMachinesPlaceholder />
      ) : (
        <div className="space-y-2">
          {gwNode.machines.map((m) => (
            <MachineRow key={m.machine_id} machine={m} gwNode={gwNode} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyMachinesPlaceholder() {
  return (
    <div className="text-center py-12 space-y-2">
      <AlertCircle size={28} className="mx-auto text-foreground/30" />
      <p className="text-sm text-foreground/50">No machines online</p>
      <p className="text-xs text-foreground/40">
        Start a vibe-board CLI on a machine and pair it with this gateway.
      </p>
    </div>
  );
}

function MachineRow({
  machine,
  gwNode,
}: {
  machine: MachineStatus;
  gwNode: GatewayNode;
}) {
  const { openMachineProjectsTab } = useConnectionStore();
  const isPaired = gwNode.isMachinePaired(machine.machine_id);
  const [showPair, setShowPair] = useState(false);
  const label = machine.hostname || machine.machine_id.slice(0, 8);

  const handleClick = () => {
    if (isPaired) {
      openMachineProjectsTab(gwNode.connectionId, machine.machine_id, label);
    } else {
      setShowPair((v) => !v);
    }
  };

  return (
    <div className="border border-border rounded bg-muted/30">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-foreground/5"
        onClick={handleClick}
      >
        {isPaired ? (
          <Wifi size={16} className="text-green-500 shrink-0" />
        ) : showPair ? (
          <ChevronDown size={16} className="shrink-0" />
        ) : (
          <WifiOff size={16} className="text-foreground/30 shrink-0" />
        )}
        <Monitor size={16} className="text-foreground/50 shrink-0" />
        <span className="text-sm flex-1 truncate">
          {label}
          {machine.port ? `:${machine.port}` : ''}
        </span>
        {!isPaired && (
          <span className="text-xs text-foreground/40">Not paired</span>
        )}
      </div>

      {showPair && !isPaired && (
        <MachinePairingForm
          gwNode={gwNode}
          machineId={machine.machine_id}
          onPaired={() => setShowPair(false)}
        />
      )}
    </div>
  );
}
