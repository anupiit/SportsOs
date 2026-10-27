'use client';

import type { AuthResponse, MeResponse, Permission, User } from '@sportsos/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { mutate } from 'swr';
import { api, getToken, setToken } from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  admissionNo?: string;
  hostel?: string;
  phone?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  permissions: Permission[];
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const applySession = useCallback((u: User | null, perms: Permission[]) => {
    setUser(u);
    setPermissions(perms);
    setStatus(u ? 'authenticated' : 'anonymous');
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      applySession(null, []);
      return;
    }
    try {
      const me = await api.get<MeResponse>('/auth/me');
      applySession(me.user, me.permissions);
    } catch {
      setToken(null);
      applySession(null, []);
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      setToken(res.accessToken);
      applySession(res.user, res.permissions);
      return res.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const res = await api.post<AuthResponse>('/auth/register', input);
      setToken(res.accessToken);
      applySession(res.user, res.permissions);
      return res.user;
    },
    [applySession],
  );

  const logout = useCallback(() => {
    setToken(null);
    applySession(null, []);
    // Drop every cached response so the next user starts clean.
    void mutate(() => true, undefined, { revalidate: false });
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => {
    const set = new Set(permissions);
    return {
      status,
      user,
      permissions,
      can: (p) => set.has(p),
      canAny: (...ps) => ps.some((p) => set.has(p)),
      login,
      register,
      logout,
      refresh,
    };
  }, [status, user, permissions, login, register, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user; only call inside the authenticated app shell. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
