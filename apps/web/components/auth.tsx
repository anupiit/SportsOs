'use client';

import type { AuthResponse, MeResponse, Permission, Role, SessionRole, User } from '@sportsos/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { mutate } from 'swr';
import { api, ApiError, getActiveRole, getToken, setActiveRole as storeActiveRole, setToken } from '@/lib/api';

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
  /** every role the user holds */
  heldRoles: Role[];
  /** grants in effect (narrowed to the active role) with their scopes */
  roles: SessionRole[];
  /** role the user is acting as; null = all held roles */
  activeRole: Role | null;
  setActiveRole: (role: Role | null) => Promise<void>;
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
  const [session, setSession] = useState<Pick<MeResponse, 'heldRoles' | 'roles' | 'activeRole'>>({ heldRoles: [], roles: [], activeRole: null });

  const applySession = useCallback((me: MeResponse | null) => {
    setUser(me?.user ?? null);
    setPermissions(me?.permissions ?? []);
    setSession({ heldRoles: me?.heldRoles ?? [], roles: me?.roles ?? [], activeRole: me?.activeRole ?? null });
    setStatus(me ? 'authenticated' : 'anonymous');
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      applySession(null);
      return;
    }
    try {
      applySession(await api.get<MeResponse>('/auth/me'));
    } catch (err) {
      // a stored active role the user no longer holds: drop it and retry once
      if (err instanceof ApiError && err.status === 403 && getActiveRole()) {
        storeActiveRole(null);
        try {
          applySession(await api.get<MeResponse>('/auth/me'));
          return;
        } catch {
          /* fall through */
        }
      }
      setToken(null);
      applySession(null);
    }
  }, [applySession]);

  const setActiveRole = useCallback(
    async (role: Role | null) => {
      storeActiveRole(role);
      await refresh();
      // every cached response may differ under the new role
      await mutate(() => true);
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      storeActiveRole(null);
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      setToken(res.accessToken);
      applySession(res);
      return res.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      storeActiveRole(null);
      const res = await api.post<AuthResponse>('/auth/register', input);
      setToken(res.accessToken);
      applySession(res);
      return res.user;
    },
    [applySession],
  );

  const logout = useCallback(() => {
    setToken(null);
    storeActiveRole(null);
    applySession(null);
    // Drop every cached response so the next user starts clean.
    void mutate(() => true, undefined, { revalidate: false });
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => {
    const set = new Set(permissions);
    return {
      status,
      user,
      permissions,
      heldRoles: session.heldRoles,
      roles: session.roles,
      activeRole: session.activeRole,
      setActiveRole,
      can: (p) => set.has(p),
      canAny: (...ps) => ps.some((p) => set.has(p)),
      login,
      register,
      logout,
      refresh,
    };
  }, [status, user, permissions, session, setActiveRole, login, register, logout, refresh]);

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
