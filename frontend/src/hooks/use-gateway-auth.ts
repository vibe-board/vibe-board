import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'vk_gateway_session';

export interface GatewaySession {
  gatewayUrl: string;
  sessionToken: string;
  userId: string;
}

function loadSession(): GatewaySession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GatewaySession;
  } catch {
    return null;
  }
}

function saveSession(session: GatewaySession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

interface RegistrationStatus {
  open: boolean;
}

/**
 * Hook for managing gateway authentication (signup/login).
 */
export function useGatewayAuth() {
  const [session, setSession] = useState<GatewaySession | null>(loadSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state on mount
  useEffect(() => {
    setSession(loadSession());
  }, []);

  const checkRegistrationStatus = useCallback(
    async (gatewayUrl: string): Promise<boolean> => {
      const resp = await fetch(
        `${gatewayUrl}/api/auth/registration-status`,
      );
      if (!resp.ok) return false;
      const data: RegistrationStatus = await resp.json();
      return data.open;
    },
    [],
  );

  const signup = useCallback(
    async (
      gatewayUrl: string,
      email: string,
      password: string,
      name?: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${gatewayUrl}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `Signup failed (${resp.status})`);
        }

        const data: { token: string; user_id: string } = await resp.json();
        const newSession: GatewaySession = {
          gatewayUrl,
          sessionToken: data.token,
          userId: data.user_id,
        };
        saveSession(newSession);
        setSession(newSession);
        return newSession;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Signup failed';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const login = useCallback(
    async (gatewayUrl: string, email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${gatewayUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `Login failed (${resp.status})`);
        }

        const data: { token: string; user_id: string } = await resp.json();
        const newSession: GatewaySession = {
          gatewayUrl,
          sessionToken: data.token,
          userId: data.user_id,
        };
        saveSession(newSession);
        setSession(newSession);
        return newSession;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Login failed';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setError(null);
  }, []);

  return {
    session,
    isAuthenticated: session !== null,
    loading,
    error,
    checkRegistrationStatus,
    signup,
    login,
    logout,
  };
}
