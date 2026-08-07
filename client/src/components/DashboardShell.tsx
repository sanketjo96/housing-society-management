import { Building2, LogOut, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '../context/AuthContext';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface DashboardShellProps {
  navItems: NavItem[];
  activeKey: string;
  onSelectKey: (key: string) => void;
  user: AuthUser | null;
  onLogout: () => void;
  children: ReactNode;
}

// Shared shell for both the admin and resident dashboards: a persistent left nav
// rail on desktop, collapsing to a hamburger-triggered slide-out drawer below the
// `md` breakpoint. Only one copy of the nav (`role="tablist"`) is ever mounted —
// its position/visibility is toggled with CSS transforms rather than being
// duplicated per breakpoint, so there's no risk of two elements sharing the same
// `role="tab"` accessible name (which would break tests and screen readers alike).
// A persistent top bar (not mobile-only) carries the signed-in user's name — visible
// regardless of which nav section is active. Log out lives as a link at the bottom of
// the left nav panel instead (UI-only placement choice; behavior is unchanged).
export function DashboardShell({ navItems, activeKey, onSelectKey, user, onLogout, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function selectAndClose(key: string) {
    onSelectKey(key);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-dvh bg-paper md:flex">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-ink p-4 transition-transform duration-200 md:sticky md:top-0 md:z-0 md:h-dvh md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-brass" />
            <span className="font-display text-lg tracking-wide text-[#EDEFEA]">SMI</span>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="text-[#EDEFEA] md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav role="tablist" aria-label="Dashboard sections" aria-orientation="vertical" className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeKey;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`tab-${item.key}`}
                aria-selected={active}
                aria-controls={`tabpanel-${item.key}`}
                onClick={() => selectAndClose(item.key)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  active ? 'bg-teal-light font-semibold text-teal' : 'text-[#B7BCB2]'
                }`}
              >
                <Icon size={16} /> {item.label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onLogout}
          className="mt-2 flex items-center gap-2 border-t border-[#334038] bg-transparent px-3 py-2.5 text-left text-sm text-[#B7BCB2]"
        >
          <LogOut size={16} /> Log out
        </button>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-white px-4 py-3 sm:gap-3 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="shrink-0 text-ink md:hidden"
          >
            <Menu size={20} />
          </button>
          {user && (
            <p className="m-0 min-w-0 truncate font-display text-sm font-semibold text-ink">
              {user.name} <span className="hidden font-normal text-muted sm:inline">· {user.role}</span>
            </p>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
