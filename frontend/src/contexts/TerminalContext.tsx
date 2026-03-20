import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

const STORAGE_KEY = 'vibe-kanban:terminal-sessions';

function loadPersistedState(): TerminalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        tabsByWorkspace: {},
        activeTabByWorkspace: {},
        closedWorkspaces: [],
        tabCounterByWorkspace: {},
      };
    const parsed = JSON.parse(raw);
    return {
      tabsByWorkspace: parsed.tabsByWorkspace || {},
      activeTabByWorkspace: parsed.activeTabByWorkspace || {},
      closedWorkspaces: parsed.closedWorkspaces || [],
      tabCounterByWorkspace: parsed.tabCounterByWorkspace || {},
    };
  } catch {
    return {
      tabsByWorkspace: {},
      activeTabByWorkspace: {},
      closedWorkspaces: [],
      tabCounterByWorkspace: {},
    };
  }
}

function saveState(state: TerminalState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — ignore
  }
}

export interface TerminalTab {
  id: string;
  title: string;
  workspaceId: string;
  taskId: string;
  cwd: string;
  /** Backend PTY session ID for reconnection */
  sessionId: string | null;
}

interface TerminalState {
  tabsByWorkspace: Record<string, TerminalTab[]>;
  activeTabByWorkspace: Record<string, string | null>;
  /** Workspaces where the user explicitly closed all terminals */
  closedWorkspaces: string[];
  /** Monotonically increasing counter per workspace for terminal numbering */
  tabCounterByWorkspace: Record<string, number>;
}

type TerminalAction =
  | { type: 'CREATE_TAB'; workspaceId: string; taskId: string; cwd: string }
  | { type: 'CLOSE_TAB'; workspaceId: string; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; workspaceId: string; tabId: string }
  | {
      type: 'UPDATE_TAB_TITLE';
      workspaceId: string;
      tabId: string;
      title: string;
    }
  | { type: 'CLEAR_WORKSPACE_TABS'; workspaceId: string }
  | {
      type: 'SET_SESSION_ID';
      workspaceId: string;
      tabId: string;
      sessionId: string | null;
    };

function generateTabId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function terminalReducer(
  state: TerminalState,
  action: TerminalAction
): TerminalState {
  switch (action.type) {
    case 'CREATE_TAB': {
      const { workspaceId, taskId, cwd } = action;
      const existingTabs = state.tabsByWorkspace[workspaceId] || [];
      const nextCounter = (state.tabCounterByWorkspace[workspaceId] || 0) + 1;
      const newTab: TerminalTab = {
        id: generateTabId(),
        title: `Terminal ${nextCounter}`,
        workspaceId,
        taskId,
        cwd,
        sessionId: null,
      };
      return {
        ...state,
        tabsByWorkspace: {
          ...state.tabsByWorkspace,
          [workspaceId]: [...existingTabs, newTab],
        },
        activeTabByWorkspace: {
          ...state.activeTabByWorkspace,
          [workspaceId]: newTab.id,
        },
        closedWorkspaces: state.closedWorkspaces.filter(
          (id) => id !== workspaceId
        ),
        tabCounterByWorkspace: {
          ...state.tabCounterByWorkspace,
          [workspaceId]: nextCounter,
        },
      };
    }

    case 'CLOSE_TAB': {
      const { workspaceId, tabId } = action;
      const tabs = state.tabsByWorkspace[workspaceId] || [];
      const newTabs = tabs.filter((t) => t.id !== tabId);
      const wasActive = state.activeTabByWorkspace[workspaceId] === tabId;
      let newActiveTab = state.activeTabByWorkspace[workspaceId];

      if (wasActive && newTabs.length > 0) {
        const closedIndex = tabs.findIndex((t) => t.id === tabId);
        const newIndex = Math.min(closedIndex, newTabs.length - 1);
        newActiveTab = newTabs[newIndex]?.id ?? null;
      } else if (newTabs.length === 0) {
        newActiveTab = null;
      }

      // Track when user explicitly closes the last tab
      const closedWorkspaces =
        newTabs.length === 0
          ? [...new Set([...state.closedWorkspaces, workspaceId])]
          : state.closedWorkspaces;

      return {
        ...state,
        tabsByWorkspace: {
          ...state.tabsByWorkspace,
          [workspaceId]: newTabs,
        },
        activeTabByWorkspace: {
          ...state.activeTabByWorkspace,
          [workspaceId]: newActiveTab,
        },
        closedWorkspaces,
      };
    }

    case 'SET_ACTIVE_TAB': {
      const { workspaceId, tabId } = action;
      return {
        ...state,
        activeTabByWorkspace: {
          ...state.activeTabByWorkspace,
          [workspaceId]: tabId,
        },
      };
    }

    case 'UPDATE_TAB_TITLE': {
      const { workspaceId, tabId, title } = action;
      const tabs = state.tabsByWorkspace[workspaceId] || [];
      return {
        ...state,
        tabsByWorkspace: {
          ...state.tabsByWorkspace,
          [workspaceId]: tabs.map((t) =>
            t.id === tabId ? { ...t, title } : t
          ),
        },
      };
    }

    case 'CLEAR_WORKSPACE_TABS': {
      const { workspaceId } = action;
      const restTabs = Object.fromEntries(
        Object.entries(state.tabsByWorkspace).filter(
          ([key]) => key !== workspaceId
        )
      );
      const restActive = Object.fromEntries(
        Object.entries(state.activeTabByWorkspace).filter(
          ([key]) => key !== workspaceId
        )
      );
      const restCounter = Object.fromEntries(
        Object.entries(state.tabCounterByWorkspace).filter(
          ([key]) => key !== workspaceId
        )
      );
      return {
        tabsByWorkspace: restTabs,
        activeTabByWorkspace: restActive,
        closedWorkspaces: state.closedWorkspaces.filter(
          (id) => id !== workspaceId
        ),
        tabCounterByWorkspace: restCounter,
      };
    }

    case 'SET_SESSION_ID': {
      const { workspaceId, tabId, sessionId } = action;
      const tabs = state.tabsByWorkspace[workspaceId] || [];
      return {
        ...state,
        tabsByWorkspace: {
          ...state.tabsByWorkspace,
          [workspaceId]: tabs.map((t) =>
            t.id === tabId ? { ...t, sessionId } : t
          ),
        },
      };
    }

    default:
      return state;
  }
}

interface TerminalContextType {
  getTabsForWorkspace: (workspaceId: string) => TerminalTab[];
  getActiveTab: (workspaceId: string) => TerminalTab | null;
  hasTerminalForTask: (taskId: string) => boolean;
  isWorkspaceClosed: (workspaceId: string) => boolean;
  createTab: (workspaceId: string, taskId: string, cwd: string) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  setActiveTab: (workspaceId: string, tabId: string) => void;
  updateTabTitle: (workspaceId: string, tabId: string, title: string) => void;
  clearWorkspaceTabs: (workspaceId: string) => void;
  setSessionId: (
    workspaceId: string,
    tabId: string,
    sessionId: string | null
  ) => void;
}

const TerminalContext = createContext<TerminalContextType | null>(null);

interface TerminalProviderProps {
  children: ReactNode;
}

export function TerminalProvider({ children }: TerminalProviderProps) {
  const [state, dispatch] = useReducer(
    terminalReducer,
    null,
    loadPersistedState
  );

  // Persist state to localStorage on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const getTabsForWorkspace = useCallback(
    (workspaceId: string): TerminalTab[] => {
      return state.tabsByWorkspace[workspaceId] || [];
    },
    [state.tabsByWorkspace]
  );

  const getActiveTab = useCallback(
    (workspaceId: string): TerminalTab | null => {
      const activeId = state.activeTabByWorkspace[workspaceId];
      if (!activeId) return null;
      const tabs = state.tabsByWorkspace[workspaceId] || [];
      return tabs.find((t) => t.id === activeId) || null;
    },
    [state.tabsByWorkspace, state.activeTabByWorkspace]
  );

  const hasTerminalForTask = useCallback(
    (taskId: string): boolean => {
      return Object.values(state.tabsByWorkspace).some((tabs) =>
        tabs.some((t) => t.taskId === taskId)
      );
    },
    [state.tabsByWorkspace]
  );

  const isWorkspaceClosed = useCallback(
    (workspaceId: string): boolean => {
      return state.closedWorkspaces.includes(workspaceId);
    },
    [state.closedWorkspaces]
  );

  const createTab = useCallback(
    (workspaceId: string, taskId: string, cwd: string) => {
      dispatch({ type: 'CREATE_TAB', workspaceId, taskId, cwd });
    },
    []
  );

  const closeTab = useCallback((workspaceId: string, tabId: string) => {
    dispatch({ type: 'CLOSE_TAB', workspaceId, tabId });
  }, []);

  const setActiveTab = useCallback((workspaceId: string, tabId: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', workspaceId, tabId });
  }, []);

  const updateTabTitle = useCallback(
    (workspaceId: string, tabId: string, title: string) => {
      dispatch({ type: 'UPDATE_TAB_TITLE', workspaceId, tabId, title });
    },
    []
  );

  const clearWorkspaceTabs = useCallback((workspaceId: string) => {
    dispatch({ type: 'CLEAR_WORKSPACE_TABS', workspaceId });
  }, []);

  const setSessionId = useCallback(
    (workspaceId: string, tabId: string, sessionId: string | null) => {
      dispatch({ type: 'SET_SESSION_ID', workspaceId, tabId, sessionId });
    },
    []
  );

  const value = useMemo(
    () => ({
      getTabsForWorkspace,
      getActiveTab,
      hasTerminalForTask,
      isWorkspaceClosed,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      clearWorkspaceTabs,
      setSessionId,
    }),
    [
      getTabsForWorkspace,
      getActiveTab,
      hasTerminalForTask,
      isWorkspaceClosed,
      createTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      clearWorkspaceTabs,
      setSessionId,
    ]
  );

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within TerminalProvider');
  }
  return context;
}
