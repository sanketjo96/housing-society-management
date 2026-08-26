import { useSyncExternalStore } from 'react';

// useSyncExternalStore so the first render is already correct, no flash of
// the wrong layout before a resize listener catches up.
const QUERY = '(max-width: 767px)';

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
