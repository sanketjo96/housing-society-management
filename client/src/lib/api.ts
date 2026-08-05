const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// credentials: 'include' on every call, unconditionally — this is what lets the
// browser send/receive the httpOnly refresh-token cookie (Task 2.7's backend half).
// Without it, the cookie set at login would never be attached to the /api/auth/refresh
// request that needs it, cross-origin (local dev) or not.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}
