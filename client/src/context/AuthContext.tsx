import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../lib/api';
import { getAccessToken, setAccessToken } from '../lib/auth-token';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'ADMIN' | 'OWNER' | 'TENANT';
  societyId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getAccessToken();
  if (!token) return null;
  const res = await apiFetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Cleared on login/logout so cached query data from one identity is never
  // served to a different one that just signed in on the same tab.
  const queryClient = useQueryClient();

  useEffect(() => {
    // Silent session restore: the access token is lost on page reload, but the
    // httpOnly refresh-token cookie may still be valid — try it first.
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch('/api/auth/refresh', { method: 'POST' });
        if (!res.ok) throw new Error('no valid session');
        const { accessToken } = await res.json();
        setAccessToken(accessToken);
        const me = await fetchCurrentUser();
        if (!cancelled) setUser(me);
      } catch {
        setAccessToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error ?? 'Login failed. Please try again.');
    }
    queryClient.clear();
    setAccessToken(body.accessToken);
    setUser(body.user);
  }

  async function logout(): Promise<void> {
    // Best-effort — clear local state even if the network call fails.
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    setAccessToken(null);
    setUser(null);
  }

  // Re-fetches and updates the current user without a full page reload — for
  // callers that update the user's own row out-of-band.
  async function refreshUser(): Promise<void> {
    const me = await fetchCurrentUser();
    setUser(me);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
