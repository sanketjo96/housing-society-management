import { getAccessToken } from './auth-token';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// credentials: 'include' on every call so the httpOnly refresh-token cookie
// is sent/received.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // A FormData body must not get an explicit Content-Type — the browser sets
  // its own multipart boundary only when the header is left unset.
  const isFormData = init.body instanceof FormData;
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
}

// apiFetch with the Bearer access token attached.
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  return apiFetch(path, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
}
