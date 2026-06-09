// frontend/src/components/tabs/GatewayHomeTab.tsx
import { useState } from 'react';
import {
  ChevronDown,
  LogOut,
  Wifi,
  WifiOff,
  Monitor,
  AlertCircle,
  MoreHorizontal,
} from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';
import { MachinePairingForm } from './MachinePairingForm';
import { UnpairMachineDialog } from '@/components/dialogs';
import { clearAllCachedEntries } from '@/utils/conversationCache';
import type { MachineStatus } from '@/lib/e2ee';

export function GatewayHomeTab({ connectionId }: { connectionId: string }) {
  const machines = useConnectionStore(
    (s) =>
      s.nodes.find((n) => n.entry.id === connectionId)?.gatewayState
        ?.machines ?? []
  );
  const logoutConnection = useConnectionStore((s) => s.logoutConnection);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Machines</h2>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded text-foreground/70 hover:text-foreground"
          onClick={() => logoutConnection(connectionId)}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {machines.length === 0 ? (
        <EmptyMachinesPlaceholder />
      ) : (
        <div className="space-y-2">
          {machines.map((m) => (
            <MachineRow
              key={m.machine_id}
              connectionId={connectionId}
              machine={m}
            />
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
  connectionId,
  machine,
}: {
  connectionId: string;
  machine: MachineStatus;
}) {
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );
  const openMachineProjectsTab = useConnectionStore(
    (s) => s.openMachineProjectsTab
  );
  const unpairMachine = useConnectionStore((s) => s.unpairMachine);
  const [showPair, setShowPair] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const label = machine.hostname || machine.machine_id.slice(0, 8);

  const handleUnpair = async () => {
    setShowMenu(false);
    const result = await UnpairMachineDialog.show({ hostname: label });
    if (!result.confirmed) return;
    unpairMachine(connectionId, machine.machine_id);
    if (result.clearCache) {
      await clearAllCachedEntries();
    }
  };

  const handleClick = () => {
    if (isPaired) {
      openMachineProjectsTab(connectionId, machine.machine_id, label);
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
        {isPaired && (
          <div className="relative shrink-0">
            <button
              aria-label="Machine actions"
              className="p-1.5 rounded hover:bg-foreground/10"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((v) => !v);
              }}
            >
              <MoreHorizontal size={16} className="text-foreground/50" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[140px]">
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpair();
                  }}
                >
                  <WifiOff size={14} /> Unpair
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showPair && !isPaired && (
        <MachinePairingForm
          connectionId={connectionId}
          machineId={machine.machine_id}
          onPaired={() => setShowPair(false)}
        />
      )}
    </div>
  );
}
