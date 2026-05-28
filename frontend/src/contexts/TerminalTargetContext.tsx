import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type TerminalTargetType = 'task' | 'project' | 'home';

export interface TerminalTarget {
  id: string;
  label: string;
  type: TerminalTargetType;
  connectionId?: string;
  machineId?: string;
  cwd: string;
  workspaceId?: string;
  attemptId?: string;
  taskId?: string;
  projectId?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface TerminalTargetContextValue {
  targets: TerminalTarget[];
  registerTargets: (scopeId: string, targets: TerminalTarget[]) => void;
  unregisterTargets: (scopeId: string) => void;
  getBestTarget: () => TerminalTarget | null;
}

const TerminalTargetContext = createContext<TerminalTargetContextValue | null>(
  null
);

function targetRank(type: TerminalTargetType): number {
  if (type === 'task') return 0;
  if (type === 'project') return 1;
  return 2;
}

export function TerminalTargetProvider({ children }: { children: ReactNode }) {
  const [targetsByScope, setTargetsByScope] = useState<
    Record<string, TerminalTarget[]>
  >({});

  const registerTargets = useCallback(
    (scopeId: string, targets: TerminalTarget[]) => {
      setTargetsByScope((prev) => ({ ...prev, [scopeId]: targets }));
    },
    []
  );

  const unregisterTargets = useCallback((scopeId: string) => {
    setTargetsByScope((prev) => {
      const { [scopeId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const targets = useMemo(
    () => Object.values(targetsByScope).flat(),
    [targetsByScope]
  );

  const getBestTarget = useCallback(() => {
    return (
      targets
        .filter((target) => !target.disabled && target.cwd)
        .sort((a, b) => targetRank(a.type) - targetRank(b.type))[0] ?? null
    );
  }, [targets]);

  const value = useMemo(
    () => ({ targets, registerTargets, unregisterTargets, getBestTarget }),
    [targets, registerTargets, unregisterTargets, getBestTarget]
  );

  return (
    <TerminalTargetContext.Provider value={value}>
      {children}
    </TerminalTargetContext.Provider>
  );
}

export function useTerminalTargets() {
  const context = useContext(TerminalTargetContext);
  if (!context) {
    throw new Error(
      'useTerminalTargets must be used within TerminalTargetProvider'
    );
  }
  return context;
}
