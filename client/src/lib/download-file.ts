import { authedFetch } from './api';

// Authenticated file endpoints aren't public URLs, so a plain <a href> can't
// carry the Bearer token — fetch and hand off a blob: URL instead.
export async function downloadAuthedFile(path: string, errorMessage: string) {
  const res = await authedFetch(path);
  if (!res.ok) throw new Error(errorMessage);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
