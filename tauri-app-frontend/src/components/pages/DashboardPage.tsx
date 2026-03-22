import { useConnectionStore, useAppStore } from '@/stores';
import { Card, StatusDot, Badge, Skeleton } from '@/components/ui';

export function DashboardPage() {
  const { servers, statuses, activeServerId, gatewayMachines } = useConnectionStore();
  const { projects, tasks, loading, setView } = useAppStore();

  const connectedServers = servers.filter((s) => statuses[s.id]?.connected);
  const totalMachines = Object.values(gatewayMachines).flat().length;
  const onlineMachines = Object.values(gatewayMachines).flat().filter((m) => m.online).length;
  const runningTasks = tasks.filter((t) => t.status === 'in_progress');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Dashboard</h2>
        <p className="text-sm text-text-tertiary">Overview of your Vibe Board instances</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Connected Servers"
          value={connectedServers.length}
          total={servers.length}
          color="accent"
        />
        <StatCard
          label="Online Machines"
          value={onlineMachines}
          total={totalMachines}
          color="success"
        />
        <StatCard
          label="Running Tasks"
          value={runningTasks.length}
          color="warning"
        />
        <StatCard
          label="Pending Tasks"
          value={pendingTasks.length}
          color="info"
        />
      </div>

      {/* Server status */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Server Status</h3>
        {servers.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-sm text-text-tertiary mb-3">No servers configured</p>
            <button
              onClick={() => setView('servers')}
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Add a server
            </button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {servers.map((server) => {
              const status = statuses[server.id];
              const machines = gatewayMachines[server.id] ?? [];
              return (
                <Card key={server.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot status={status?.connected ? 'online' : 'offline'} />
                      <span className="text-sm font-medium text-text-primary">{server.name}</span>
                    </div>
                    <Badge variant={server.mode === 'gateway' ? 'info' : 'muted'}>
                      {server.mode === 'gateway' ? 'Gateway' : 'Direct'}
                    </Badge>
                  </div>
                  <div className="text-xs text-text-tertiary">{server.url}</div>
                  {server.mode === 'gateway' && machines.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-text-disabled">Machines</div>
                      {machines.map((m) => (
                        <div key={m.machine_id} className="flex items-center gap-2 text-xs text-text-secondary">
                          <StatusDot status={m.online ? 'online' : 'offline'} />
                          <span>{m.hostname}</span>
                          <span className="text-text-disabled ml-auto">{m.platform}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {status?.error && (
                    <div className="text-xs text-error">{status.error}</div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Recent Tasks</h3>
        {tasks.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-sm text-text-tertiary">No tasks yet</p>
          </Card>
        ) : (
          <div className="space-y-1">
            {tasks.slice(0, 5).map((task) => (
              <Card key={task.id} padding={false} className="flex items-center gap-3 px-4 py-2.5">
                <StatusDot status={task.status === 'in_progress' ? 'running' : task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : 'pending'} />
                <span className="text-sm text-text-primary truncate flex-1">{task.title}</span>
                <Badge variant={statusBadgeVariant(task.status)}>{task.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, total, color }: { label: string; value: number; total?: number; color: string }) {
  return (
    <Card className="space-y-1">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold text-${color}`}>{value}</span>
        {total !== undefined && (
          <span className="text-sm text-text-disabled">/ {total}</span>
        )}
      </div>
    </Card>
  );
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'in_progress': return 'warning' as const;
    case 'completed': return 'success' as const;
    case 'failed': return 'error' as const;
    default: return 'muted' as const;
  }
}
