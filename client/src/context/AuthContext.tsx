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

  useEffect(() => {
    // Silent session restore, on every page load. The access token is never
    // persisted (src/lib/auth-token.ts) — it's gone the instant the page reloads —
    // but the httpOnly refresh-token cookie the browser holds might still be valid.
    // Try it before deciding the user is logged out, so a page refresh doesn't force
    // a fresh login every time.
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
    setAccessToken(body.accessToken);
    setUser(body.user);
  }

  async function logout(): Promise<void> {
    // Best-effort: even if the network call fails, clear local state so the UI
    // reflects "logged out" immediately rather than being stuck.
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Triggers oxlint's react/only-export-components warning (configured as "warn", not
// "error", in .oxlintrc.json — doesn't fail `npm run lint`) — deliberate: colocating
// the context, provider, and hook in one file is a standard, widely-used React
// pattern. Splitting it up would only smooth out dev-mode Fast Refresh (a full
// reload instead of a hot-swap when this file changes), not correctness.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
