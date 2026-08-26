// In-memory access token — never localStorage/sessionStorage, so an XSS bug
// elsewhere has nothing to read off disk. Lost on refresh by design; the auth
// context re-fetches it via the httpOnly refresh-token cookie on app load.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
