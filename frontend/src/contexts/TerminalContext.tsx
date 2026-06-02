import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';

export type TerminalTabContext =
  | { type: 'task'; attemptId: string; taskId: string }
  | { type: 'project'; projectId: string }
  | { type: 'home' };

/**
 * Imperative handle to the physical terminal panel, registered by the layout
 * that owns the resizable panel. Drawer commands (open/close/toggle) drive the
 * panel through this controller; `isDrawerOpen` is only ever a mirror of the
 * panel's real visibility (see `setDrawerOpen`). Keeping commands one-way
 * (button → panel) and state one-way (panel → mirror) avoids the feedback loop
 * where a button toggle and an `onResize` callback fight over a single boolean.
 */
export interface TerminalDrawerController {
  open: () => void;
  close: () => void;
}

const STORAGE_KEY = 'vibe-board:terminal-sessions';

function isValidTab(value: unknown): value is TerminalTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Record<string, unknown>;
  if (typeof tab.id !== 'string') return false;
  if (typeof tab.title !== 'string') return false;
  if (typeof tab.workspaceId !== 'string') return false;
  if (typeof tab.taskId !== 'string') return false;
  if (typeof tab.cwd !== 'string') return false;
  if (tab.sessionId !== null && typeof tab.sessionId !== 'string') return false;
  // `context` was added in a later schema. Tabs persisted before that lack it,
  // and rendering them would crash buildEndpointUrl on `context.type`.
  const ctx = tab.context as { type?: unknown } | undefined;
  if (
    !ctx ||
    (ctx.type !== 'task' && ctx.type !== 'project' && ctx.type !== 'home')
  ) {
    return false;
  }
  return true;
}

function sanitizeTabsByWorkspace(raw: unknown): Record<string, TerminalTab[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, TerminalTab[]> = {};
  for (const [workspaceId, tabs] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (!Array.isArray(tabs)) continue;
    const valid = tabs.filter(isValidTab);
    if (valid.length > 0) out[workspaceId] = valid;
  }
  return out;
}

const AUTO_TITLE_RE = /^Terminal \d+$/;

function emptyState(): TerminalState {
  return {
    tabsByWorkspace: {},
    activeTabByWorkspace: {},
    closedWorkspaces: [],
    tabCounter: 0,
    isDrawerOpen: false,
    globalActiveTabId: null,
  };
}

function loadPersistedState(): TerminalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    const tabsByWorkspace = sanitizeTabsByWorkspace(parsed.tabsByWorkspace);

    // Migration: legacy state used a per-workspace counter, so two workspaces
    // could each have a "Terminal 1". The unified tab bar (`getAllTabs`) shows
    // tabs from every workspace in one row, so duplicates are visible. When we
    // detect the old format, renumber every auto-titled tab sequentially so
    // titles are globally unique. User-renamed tabs are left untouched.
    const isLegacy =
      parsed.tabCounterByWorkspace != null && parsed.tabCounter == null;
    let tabCounter: number;
    let migratedTabs = tabsByWorkspace;

    if (isLegacy) {
      let counter = 0;
      migratedTabs = Object.fromEntries(
        Object.entries(tabsByWorkspace).map(([wsId, tabs]) => [
          wsId,
          tabs.map((tab) => {
            if (!AUTO_TITLE_RE.test(tab.title)) return tab;
            counter += 1;
            return { ...tab, title: `Terminal ${counter}` };
          }),
        ])
      );
      tabCounter = counter;
    } else {
      tabCounter =
        typeof parsed.tabCounter === 'number' ? parsed.tabCounter : 0;
    }

    return {
      tabsByWorkspace: migratedTabs,
      activeTabByWorkspace: parsed.activeTabByWorkspace || {},
      closedWorkspaces: parsed.closedWorkspaces || [],
      tabCounter,
      isDrawerOpen: false,
      globalActiveTabId: parsed.globalActiveTabId ?? null,
    };
  } catch {
    return emptyState();
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
  context: TerminalTabContext;
}

interface TerminalState {
  tabsByWorkspace: Record<string, TerminalTab[]>;
  activeTabByWorkspace: Record<string, string | null>;
  /** Workspaces where the user explicitly closed all terminals */
  closedWorkspaces: string[];
  /** Monotonically increasing counter for terminal numbering across all workspaces */
  tabCounter: number;
  isDrawerOpen: boolean;
  globalActiveTabId: string | null;
}

type TerminalAction =
  | {
      type: 'CREATE_TAB';
      workspaceId: string;
      taskId: string;
      cwd: string;
      context: TerminalTabContext;
    }
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
    }
  | { type: 'SET_DRAWER_OPEN'; open: boolean }
  | { type: 'SET_GLOBAL_ACTIVE_TAB'; tabId: string };

function generateTabId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function terminalReducer(
  state: TerminalState,
  action: TerminalAction
): TerminalState {
  switch (action.type) {
    case 'CREATE_TAB': {
      const { workspaceId, taskId, cwd, context } = action;
      const existingTabs = state.tabsByWorkspace[workspaceId] || [];
      const nextCounter = state.tabCounter + 1;
      const newTab: TerminalTab = {
        id: generateTabId(),
        title: `Terminal ${nextCounter}`,
        workspaceId,
        taskId,
        cwd,
        sessionId: null,
        context,
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
        tabCounter: nextCounter,
        globalActiveTabId: newTab.id,
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

      let globalActiveTabId = state.globalActiveTabId;
      if (globalActiveTabId === tabId) {
        globalActiveTabId = newActiveTab;
        if (!globalActiveTabId) {
          const allTabs = Object.values({
            ...state.tabsByWorkspace,
            [workspaceId]: newTabs,
          }).flat();
          globalActiveTabId = allTabs[0]?.id ?? null;
        }
      }

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
        globalActiveTabId,
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
      return {
        tabsByWorkspace: restTabs,
        activeTabByWorkspace: restActive,
        closedWorkspaces: state.closedWorkspaces.filter(
          (id) => id !== workspaceId
        ),
        tabCounter: state.tabCounter,
        isDrawerOpen: state.isDrawerOpen,
        globalActiveTabId: state.globalActiveTabId,
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

    case 'SET_DRAWER_OPEN':
      if (state.isDrawerOpen === action.open) return state;
      return { ...state, isDrawerOpen: action.open };
    case 'SET_GLOBAL_ACTIVE_TAB':
      return { ...state, globalActiveTabId: action.tabId };

    default:
      return state;
  }
}

interface TerminalContextType {
  getTabsForWorkspace: (workspaceId: string) => TerminalTab[];
  getActiveTab: (workspaceId: string) => TerminalTab | null;
  hasTerminalForTask: (taskId: string) => boolean;
  isWorkspaceClosed: (workspaceId: string) => boolean;
  createTab: (
    workspaceId: string,
    taskId: string,
    cwd: string,
    context: TerminalTabContext
  ) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  setActiveTab: (workspaceId: string, tabId: string) => void;
  updateTabTitle: (workspaceId: string, tabId: string, title: string) => void;
  clearWorkspaceTabs: (workspaceId: string) => void;
  setSessionId: (
    workspaceId: string,
    tabId: string,
    sessionId: string | null
  ) => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /**
   * Register the panel controller. The layout owning the resizable terminal
   * panel calls this on mount; drawer commands are forwarded to it. Returns an
   * unregister function for cleanup.
   */
  registerDrawerController: (
    controller: TerminalDrawerController
  ) => () => void;
  /**
   * Mirror the panel's real visibility into `isDrawerOpen`. Called by the
   * panel's `onResize` — this is the ONLY writer of the drawer-open state, so
   * the flag can never disagree with what's on screen.
   */
  setDrawerOpen: (open: boolean) => void;
  getAllTabs: () => TerminalTab[];
  getActiveGlobalTab: () => TerminalTab | null;
  setActiveGlobalTab: (tabId: string) => void;
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

  // Imperative handle to the physical panel, registered by the layout. Drawer
  // commands are forwarded here rather than flipping state, so a command always
  // reaches the panel even when `isDrawerOpen` already has the target value.
  const drawerControllerRef = useRef<TerminalDrawerController | null>(null);
  // Live mirror of `isDrawerOpen` for `toggleDrawer`, which must branch on the
  // current value without capturing a stale one in its callback closure.
  const isDrawerOpenRef = useRef(state.isDrawerOpen);
  isDrawerOpenRef.current = state.isDrawerOpen;

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
    (
      workspaceId: string,
      taskId: string,
      cwd: string,
      context: TerminalTabContext
    ) => {
      dispatch({ type: 'CREATE_TAB', workspaceId, taskId, cwd, context });
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

  const openDrawer = useCallback(() => {
    drawerControllerRef.current?.open();
  }, []);

  const closeDrawer = useCallback(() => {
    drawerControllerRef.current?.close();
  }, []);

  const toggleDrawer = useCallback(() => {
    // Read the live mirror via a ref so toggle reflects what's actually on
    // screen, not a value captured at render time.
    if (isDrawerOpenRef.current) {
      drawerControllerRef.current?.close();
    } else {
      drawerControllerRef.current?.open();
    }
  }, []);

  const registerDrawerController = useCallback(
    (controller: TerminalDrawerController) => {
      drawerControllerRef.current = controller;
      return () => {
        if (drawerControllerRef.current === controller) {
          drawerControllerRef.current = null;
        }
      };
    },
    []
  );

  const setDrawerOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_DRAWER_OPEN', open });
  }, []);

  const getAllTabs = useCallback((): TerminalTab[] => {
    return Object.values(state.tabsByWorkspace).flat();
  }, [state.tabsByWorkspace]);

  const getActiveGlobalTab = useCallback((): TerminalTab | null => {
    const tabId = state.globalActiveTabId;
    if (!tabId) return null;
    for (const tabs of Object.values(state.tabsByWorkspace)) {
      const found = tabs.find((t) => t.id === tabId);
      if (found) return found;
    }
    return null;
  }, [state.globalActiveTabId, state.tabsByWorkspace]);

  const setActiveGlobalTab = useCallback((tabId: string) => {
    dispatch({ type: 'SET_GLOBAL_ACTIVE_TAB', tabId });
  }, []);

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
      isDrawerOpen: state.isDrawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      registerDrawerController,
      setDrawerOpen,
      getAllTabs,
      getActiveGlobalTab,
      setActiveGlobalTab,
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
      state.isDrawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      registerDrawerController,
      setDrawerOpen,
      getAllTabs,
      getActiveGlobalTab,
      setActiveGlobalTab,
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
