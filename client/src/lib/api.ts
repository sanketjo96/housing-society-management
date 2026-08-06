import { getAccessToken } from './auth-token';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// credentials: 'include' on every call, unconditionally — this is what lets the
// browser send/receive the httpOnly refresh-token cookie (Task 2.7's backend half).
// Without it, the cookie set at login would never be attached to the /api/auth/refresh
// request that needs it, cross-origin (local dev) or not.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // A FormData body (Task 6.2's proof upload) must NOT get an explicit Content-Type —
  // the browser needs to set its own multipart/form-data boundary, which it only does
  // when the header is left unset entirely. Every other caller still gets the
  // json default it relied on before.
  const isFormData = init.body instanceof FormData;
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
}

// Every route added since Task 3.3 requires a Bearer access token (requireRole) —
// this saves every one of those pages from re-importing getAccessToken and building
// the same Authorization header by hand inline (see AuthContext's fetchCurrentUser,
// Task 2.8, for that original inline pattern — left as-is, already tested).
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  return apiFetch(path, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
}
