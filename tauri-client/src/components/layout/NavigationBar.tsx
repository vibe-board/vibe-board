import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Monitor, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGateway } from '@/contexts/GatewayContext';

const routeTitles: Record<string, string> = {
  '/': 'Projects',
  '/projects': 'Projects',
  '/tasks': 'Tasks',
  '/search': 'Search',
  '/settings': 'Settings',
  '/settings/general': 'General',
  '/settings/projects': 'Projects',
  '/settings/agents': 'Agents',
  '/settings/mcp': 'MCP Servers',
  '/settings/e2ee': 'E2EE',
  '/settings/about': 'About',
};

const rootRoutes = new Set(['/', '/projects', '/tasks', '/search', '/settings']);

interface NavigationBarProps {
  rightAction?: React.ReactNode;
  title?: string;
}

export default function NavigationBar({
  rightAction,
  title: titleProp,
}: NavigationBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    phase: gwPhase,
    selectedMachineId,
    machines,
    disconnectMachine,
  } = useGateway();

  const isRoot = rootRoutes.has(location.pathname);
  const title = titleProp ?? routeTitles[location.pathname] ?? '';

  const isGatewayReady = gwPhase === 'ready';
  const selectedMachine = isGatewayReady
    ? machines.find((m) => m.machine_id === selectedMachineId)
    : null;

  const handleSwitchMachine = useCallback(() => {
    disconnectMachine();
    navigate('/');
  }, [disconnectMachine, navigate]);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center border-b border-border bg-background px-4"
      style={{ paddingTop: 'var(--sat)', height: 'auto', minHeight: '3.5rem' }}
    >
      {!isRoot ? (
        <button
          onClick={() => navigate(-1)}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center',
            '-ml-2 rounded-md text-muted-foreground hover:text-foreground',
          )}
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="min-w-[44px]" />
      )}
      <h1 className="flex-1 text-center text-lg font-semibold text-foreground">
        {title}
      </h1>
      {selectedMachine ? (
        <div className="flex items-center gap-1">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {selectedMachine.hostname || selectedMachine.machine_id}
            {selectedMachine.port > 0 && (
              <span className="opacity-50">:{selectedMachine.port}</span>
            )}
          </span>
          <button
            onClick={handleSwitchMachine}
            className={cn(
              'flex min-h-[32px] min-w-[32px] items-center justify-center',
              'rounded-md text-muted-foreground hover:text-foreground',
            )}
            aria-label="Switch machine"
          >
            <ArrowLeftRight className="h-3 w-3" />
          </button>
        </div>
      ) : rightAction ? (
        <div className="flex items-center">{rightAction}</div>
      ) : (
        <div className="min-w-[44px]" />
      )}
    </header>
  );
}
