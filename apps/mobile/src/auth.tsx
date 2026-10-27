import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, onUnauthorized, setToken } from './api';
import type { AuthResponse, MeResponse, Permission, User } from './types';

interface AuthState {
  user: User | null;
  permissions: Permission[];
  /** True until the stored token has been checked on startup. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(async () => {
    await setToken(null);
    setUser(null);
    setPermissions([]);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api<MeResponse>('/auth/me');
    setUser(me.user);
    setPermissions(me.permissions);
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      void clear();
    });
    (async () => {
      try {
        if (await getToken()) await refresh();
      } catch (err) {
        // A stale token is cleared; a network error keeps it so the next launch can retry.
        if (err instanceof ApiError && err.status === 401) await clear();
      } finally {
        setLoading(false);
      }
    })();
    return () => onUnauthorized(null);
  }, [clear, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
      auth: false,
    });
    await setToken(res.accessToken);
    setUser(res.user);
    setPermissions(res.permissions);
  }, []);

  const can = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);

  const value = useMemo<AuthState>(
    () => ({ user, permissions, loading, login, logout: clear, refresh, can }),
    [user, permissions, loading, login, clear, refresh, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
