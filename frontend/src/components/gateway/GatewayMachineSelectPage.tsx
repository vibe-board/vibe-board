import { useGateway } from '@/contexts/GatewayContext';

export function GatewayMachineSelectPage() {
  const { machines, selectMachine, connectionError, logout } = useGateway();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold text-foreground">Select Machine</h1>
        <p className="text-sm opacity-70">
          Choose a connected machine to access.
        </p>
      </div>

      {connectionError && (
        <div className="gateway-error text-center">
          <p className="text-sm">{connectionError}</p>
        </div>
      )}

      {machines.length === 0 ? (
        <div className="text-center py-6 space-y-2">
          <p className="opacity-70">No machines online.</p>
          <div className="gateway-code-block">
            Make sure your vibe-board server is running and connected to this
            gateway.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {machines.map((m) => (
            <button
              key={m.machine_id}
              type="button"
              onClick={() => selectMachine(m.machine_id)}
              className="gateway-machine-card"
            >
              <div className="font-medium text-sm">
                {m.hostname || m.machine_id}
              </div>
              {m.platform && (
                <div className="text-xs opacity-70">{m.platform}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Sign out */}
      <p className="text-center text-sm opacity-70">
        <button type="button" onClick={logout} className="gateway-link">
          Sign out
        </button>
      </p>
    </div>
  );
}
