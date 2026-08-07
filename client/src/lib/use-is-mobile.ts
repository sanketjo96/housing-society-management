import { useSyncExternalStore } from 'react';

// Same breakpoint DashboardShell.tsx already forks its own layout on (`md`, 768px) —
// "mobile" means the same thing everywhere in this app. useSyncExternalStore (not
// useState+useEffect) so the very first render is already correct instead of
// flashing the desktop layout for one frame before a resize listener catches up.
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
