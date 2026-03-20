/**
 * GatewayContext — manages the full gateway lifecycle:
 * detecting → login → pair → machine_select → connecting → ready
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

export type GatewayPhase =
  | 'detecting'
  | 'login'
  | 'pair'
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
  // Pairing
  addPairedSecret: (base64Secret: string) => void;
  pairError: string | null;
  // Machines
  machines: MachineStatus[];
  selectedMachineId: string | null;
  selectMachine: (machineId: string) => Promise<void>;
  // Connection
  connectionError: string | null;
  connection: E2EEConnection | null;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

const SESSION_KEY = 'vk_gateway_session';

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
        // Check if we have paired secrets
        if (manager.hasPairedSecrets) {
          setPhase('machine_select');
        } else {
          setPhase('pair');
        }
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
        if (manager.hasPairedSecrets) {
          setPhase('machine_select');
        } else {
          setPhase('pair');
        }
      } catch (e) {
        setAuthError(e instanceof Error ? e.message : 'Signup failed');
      } finally {
        setAuthLoading(false);
      }
    },
    [manager]
  );

  const login = useCallback(
    async (email: string, password: string) => {
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
        if (manager.hasPairedSecrets) {
          setPhase('machine_select');
        } else {
          setPhase('pair');
        }
      } catch (e) {
        setAuthError(e instanceof Error ? e.message : 'Login failed');
      } finally {
        setAuthLoading(false);
      }
    },
    [manager]
  );

  const logout = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connectionInstance.disconnect();
    setGatewayConnection(null);
    clearStoredSession();
    setSession(null);
    setSelectedMachineId(null);
    setMachines([]);
    setPhase('login');
  }, [connectionInstance]);

  // Pairing
  const addPairedSecret = useCallback(
    (base64Secret: string) => {
      try {
        manager.addPairedSecret(base64Secret);
        setPairError(null);
        setPhase('machine_select');
      } catch (e) {
        setPairError(e instanceof Error ? e.message : 'Invalid master secret');
      }
    },
    [manager]
  );

  // Machine selection → connect (with auto-reconnect)
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectToMachine = useCallback(
    async (machineId: string, isReconnect = false) => {
      if (!session) return;
      if (!isReconnect) {
        setSelectedMachineId(machineId);
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
    [session, connectionInstance]
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

  const value: GatewayContextValue = {
    phase,
    session,
    authError,
    authLoading,
    registrationOpen,
    signup,
    login,
    logout,
    addPairedSecret,
    pairError,
    machines,
    selectedMachineId,
    selectMachine,
    connectionError,
    connection: phase === 'ready' ? connectionInstance : null,
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
