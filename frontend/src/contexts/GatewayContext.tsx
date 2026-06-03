/**
 * GatewayContext — manages the full gateway lifecycle:
 * detecting → login → machine_select → connecting → ready
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { E2EEManager, E2EEConnection, type MachineStatus } from '@/lib/e2ee';
import { detectGatewayMode, setGatewayConnection } from '@/lib/gatewayMode';
import { QueryClient, QueryCache } from '@tanstack/react-query';

export type GatewayPhase =
  | 'detecting'
  | 'login'
  | 'machine_select'
  | 'connecting'
  | 'ready'
  | 'local'; // not gateway mode

interface GatewaySession {
  sessionToken: string;
  userId: string;
}

interface GatewayContextValue {
  phase: GatewayPhase;
  // Auth
  session: GatewaySession | null;
  authError: string | null;
  authLoading: boolean;
  registrationOpen: boolean | null;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  // Per-machine pairing
  pairMachine: (machineId: string, base64Secret: string) => void;
  unpairMachine: (machineId: string) => void;
  isMachinePaired: (machineId: string) => boolean;
  pairError: string | null;
  // Machines
  machines: MachineStatus[];
  selectedMachineId: string | null;
  selectMachine: (machineId: string) => Promise<void>;
  disconnectMachine: () => void;
  // Connection
  connectionError: string | null;
  connection: E2EEConnection | null;
  // Per-machine query client (for cache isolation)
  machineQueryClient: QueryClient | null;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

const SESSION_KEY = 'vk_gateway_session';
const SELECTED_MACHINE_KEY = 'vk_gateway_selected_machine';

function loadSession(): GatewaySession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GatewaySession;
  } catch {
    return null;
  }
}

function saveSession(session: GatewaySession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function loadSelectedMachine(): string | null {
  return localStorage.getItem(SELECTED_MACHINE_KEY);
}

function saveSelectedMachine(machineId: string): void {
  localStorage.setItem(SELECTED_MACHINE_KEY, machineId);
}

function clearSelectedMachine(): void {
  localStorage.removeItem(SELECTED_MACHINE_KEY);
}

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<GatewayPhase>('detecting');
  const [session, setSession] = useState<GatewaySession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(
    null
  );
  const [pairError, setPairError] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    null
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionInstance] = useState(() => new E2EEConnection());
  const [manager] = useState(() => E2EEManager.getInstance());

  // Per-machine QueryClient cache: each machine gets its own QueryClient
  // so data from machine A never leaks into machine B's UI.
  const queryClientMapRef = useRef(new Map<string, QueryClient>());
  const getQueryClientForMachine = useCallback((machineId: string) => {
    let qc = queryClientMapRef.current.get(machineId);
    if (!qc) {
      qc = new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            console.error('[React Query Error]', {
              queryKey: query.queryKey,
              error,
              message: error instanceof Error ? error.message : String(error),
            });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
          },
        },
      });
      queryClientMapRef.current.set(machineId, qc);
    }
    return qc;
  }, []);

  // Track whether we should auto-connect on startup (set during detection)
  const pendingAutoConnectRef = useRef<string | null>(null);

  // Step 1: Detect gateway mode
  useEffect(() => {
    detectGatewayMode().then((isGateway) => {
      if (!isGateway) {
        setPhase('local');
        return;
      }
      // Check for stored session
      const stored = loadSession();
      if (stored) {
        setSession(stored);
        // Check if we had a machine selected and it's still paired
        const savedMachine = loadSelectedMachine();
        if (savedMachine && manager.isMachinePaired(savedMachine)) {
          // Will auto-connect once connectToMachine is available
          pendingAutoConnectRef.current = savedMachine;
          setSelectedMachineId(savedMachine);
        }
        setPhase('machine_select');
      } else {
        setPhase('login');
      }
      // Check registration status
      fetch('/api/auth/registration-status')
        .then((r) => r.json())
        .then((d) => setRegistrationOpen(d.open))
        .catch(() => setRegistrationOpen(false));
    });
  }, [manager]);

  // Step 2: When in machine_select phase, connect to gateway WS for machine list
  useEffect(() => {
    if (phase !== 'machine_select' || !session) return;

    const gatewayUrl = window.location.origin;
    const wsUrl = gatewayUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');
    const connectUrl = `${wsUrl}/ws/webui?token=${encodeURIComponent(session.sessionToken)}`;

    const ws = new WebSocket(connectUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'auth_ok') {
          // connected
        } else if (msg.type === 'auth_error') {
          // session expired, need to re-login
          clearStoredSession();
          setSession(null);
          setPhase('login');
        } else if (msg.type === 'machines') {
          setMachines(msg.machines);
        } else if (msg.type === 'machine_online') {
          setMachines((prev) => {
            if (prev.find((m) => m.machine_id === msg.machine_id)) return prev;
            return [
              ...prev,
              {
                machine_id: msg.machine_id,
                hostname: msg.hostname || '',
                platform: msg.platform || '',
                port: msg.port || 0,
              },
            ];
          });
        } else if (msg.type === 'machine_offline') {
          setMachines((prev) =>
            prev.filter((m) => m.machine_id !== msg.machine_id)
          );
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setConnectionError('Failed to connect to gateway');
    };

    return () => {
      ws.close();
    };
  }, [phase, session]);

  // Auth actions
  const signup = useCallback(
    async (email: string, password: string, name?: string) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const resp = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `Signup failed (${resp.status})`);
        }
        const data: { token: string; user_id: string } = await resp.json();
        const newSession = {
          sessionToken: data.token,
          userId: data.user_id,
        };
        saveSession(newSession);
        setSession(newSession);
        setPhase('machine_select');
      } catch (e) {
        setAuthError(e instanceof Error ? e.message : 'Signup failed');
      } finally {
        setAuthLoading(false);
      }
    },
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Login failed (${resp.status})`);
      }
      const data: { token: string; user_id: string } = await resp.json();
      const newSession = {
        sessionToken: data.token,
        userId: data.user_id,
      };
      saveSession(newSession);
      setSession(newSession);
      setPhase('machine_select');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connectionInstance.disconnect();
    setGatewayConnection(null);
    clearStoredSession();
    clearSelectedMachine();
    setSession(null);
    setSelectedMachineId(null);
    setMachines([]);
    setPhase('login');
  }, [connectionInstance]);

  // Per-machine pairing
  const pairMachine = useCallback(
    (machineId: string, base64Secret: string) => {
      try {
        manager.pairMachine(machineId, base64Secret);
        setPairError(null);
      } catch (e) {
        setPairError(e instanceof Error ? e.message : 'Invalid master secret');
      }
    },
    [manager]
  );

  const unpairMachine = useCallback(
    (machineId: string) => {
      manager.unpairMachine(machineId);
      setPairError(null);
    },
    [manager]
  );

  const isMachinePaired = useCallback(
    (machineId: string) => {
      return manager.isMachinePaired(machineId);
    },
    [manager]
  );

  // Machine selection → connect (with auto-reconnect)
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectToMachine = useCallback(
    async (machineId: string, isReconnect = false) => {
      if (!session) return;

      // Check that machine is paired before connecting
      if (!manager.isMachinePaired(machineId)) {
        setConnectionError('Machine not paired. Add the master secret first.');
        return;
      }

      if (!isReconnect) {
        setSelectedMachineId(machineId);
        saveSelectedMachine(machineId);
        reconnectAttemptsRef.current = 0;
      }
      setPhase('connecting');
      setConnectionError(null);

      try {
        const gatewayUrl = window.location.origin;
        const conn = isReconnect ? new E2EEConnection() : connectionInstance;
        await conn.connect({
          gatewayUrl,
          sessionToken: session.sessionToken,
          machineId,
          onConnect: () => {
            reconnectAttemptsRef.current = 0;
          },
          onDisconnect: () => {
            setGatewayConnection(null);
            // Auto-reconnect (up to 5 attempts)
            const attempt = reconnectAttemptsRef.current;
            if (attempt < 5) {
              reconnectAttemptsRef.current = attempt + 1;
              const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
              setConnectionError(`Reconnecting... (attempt ${attempt + 1})`);
              setPhase('connecting');
              reconnectTimerRef.current = setTimeout(() => {
                connectToMachine(machineId, true);
              }, delay);
            } else {
              setConnectionError('Connection lost');
              setPhase('machine_select');
            }
          },
          onError: (err) => setConnectionError(err),
        });
        conn.subscribeMachine(machineId);
        // Initialize DEK exchange before exposing the connection to the app
        await conn.initDek();
        setGatewayConnection(conn);
        setPhase('ready');
      } catch (e) {
        const attempt = reconnectAttemptsRef.current;
        if (isReconnect && attempt < 5) {
          reconnectAttemptsRef.current = attempt + 1;
          const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
          reconnectTimerRef.current = setTimeout(() => {
            connectToMachine(machineId, true);
          }, delay);
        } else {
          setConnectionError(
            e instanceof Error ? e.message : 'Connection failed'
          );
          setPhase('machine_select');
        }
      }
    },
    [session, connectionInstance, manager]
  );

  const selectMachine = useCallback(
    async (machineId: string) => {
      // Clear any pending reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return connectToMachine(machineId);
    },
    [connectToMachine]
  );

  // Auto-connect to previously selected machine after refresh.
  // We wait for the machine_select WS to deliver the machine list, then connect
  // if the saved machine is online.
  useEffect(() => {
    const machineId = pendingAutoConnectRef.current;
    if (!machineId || phase !== 'machine_select' || !session) return;
    const isOnline = machines.some((m) => m.machine_id === machineId);
    if (isOnline) {
      pendingAutoConnectRef.current = null;
      connectToMachine(machineId);
    }
  }, [machines, phase, session, connectToMachine]);

  const disconnectMachine = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    // disconnect() clears WS event handlers before closing, so onDisconnect
    // won't fire and auto-reconnect won't be triggered.
    connectionInstance.disconnect();
    setGatewayConnection(null);
    setSelectedMachineId(null);
    clearSelectedMachine();
    setPhase('machine_select');
  }, [connectionInstance]);

  const value: GatewayContextValue = {
    phase,
    session,
    authError,
    authLoading,
    registrationOpen,
    signup,
    login,
    logout,
    pairMachine,
    unpairMachine,
    isMachinePaired,
    pairError,
    machines,
    selectedMachineId,
    selectMachine,
    disconnectMachine,
    connectionError,
    connection: phase === 'ready' ? connectionInstance : null,
    machineQueryClient: selectedMachineId
      ? getQueryClientForMachine(selectedMachineId)
      : null,
  };

  return (
    <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>
  );
}

export function useGateway(): GatewayContextValue {
  const ctx = useContext(GatewayContext);
  if (!ctx) throw new Error('useGateway must be used within GatewayProvider');
  return ctx;
}
