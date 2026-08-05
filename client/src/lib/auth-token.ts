// Minimal in-memory access token store — deliberately NOT localStorage/sessionStorage.
// A token that only lives in a JS variable is lost on page refresh (by design — that's
// what the httpOnly refresh-token cookie is for; Task 2.8's auth context will call
// POST /api/auth/refresh on app load to silently re-establish a session from it).
// Keeping the access token in memory only, never on disk, means an XSS vulnerability
// elsewhere in the app has nothing to read.
//
// Deliberately minimal — this is only "somewhere to put the token after a successful
// login" for Task 2.7. The real auth context/hook (current user, protected routes)
// is Task 2.8's job, built on top of this.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
