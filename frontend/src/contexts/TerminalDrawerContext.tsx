import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';

const STORAGE_KEY = 'vibe-board:terminal-drawer';

interface DrawerState {
  isOpen: boolean;
  cwd: string | null;
  workspaceId: string;
}

function loadDrawerState(): DrawerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        isOpen: parsed.isOpen ?? false,
        cwd: parsed.cwd ?? null,
        workspaceId: parsed.workspaceId ?? 'global-terminal',
      };
    }
  } catch {
    // ignore
  }
  return { isOpen: false, cwd: null, workspaceId: 'global-terminal' };
}

function saveDrawerState(state: DrawerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface TerminalDrawerContextType {
  isDrawerOpen: boolean;
  drawerCwd: string | null;
  drawerWorkspaceId: string;
  openDrawer: (cwd: string, workspaceId: string) => void;
  closeDrawer: () => void;
  toggleDrawer: (cwd: string, workspaceId: string) => void;
}

const TerminalDrawerContext = createContext<TerminalDrawerContextType | null>(
  null
);

export function TerminalDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrawerState>(loadDrawerState);

  const openDrawer = useCallback((cwd: string, workspaceId: string) => {
    const next = { isOpen: true, cwd, workspaceId };
    saveDrawerState(next);
    setState(next);
  }, []);

  const closeDrawer = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, isOpen: false };
      saveDrawerState(next);
      return next;
    });
  }, []);

  const toggleDrawer = useCallback((cwd: string, workspaceId: string) => {
    setState((prev) => {
      const shouldClose = prev.isOpen && prev.workspaceId === workspaceId;
      const next = shouldClose
        ? { ...prev, isOpen: false }
        : { isOpen: true, cwd, workspaceId };
      saveDrawerState(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      isDrawerOpen: state.isOpen,
      drawerCwd: state.cwd,
      drawerWorkspaceId: state.workspaceId,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    }),
    [state, openDrawer, closeDrawer, toggleDrawer]
  );

  return (
    <TerminalDrawerContext.Provider value={value}>
      {children}
    </TerminalDrawerContext.Provider>
  );
}

export function useTerminalDrawer() {
  const context = useContext(TerminalDrawerContext);
  if (!context) {
    throw new Error(
      'useTerminalDrawer must be used within TerminalDrawerProvider'
    );
  }
  return context;
}
