import { Building2, LogOut, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { AuthUser } from '../context/AuthContext';

export interface NavItem {
  // Absolute path (always under /dashboard) — real, deep-linkable/shareable URLs
  // rather than in-memory tab state, so each section survives a refresh/bookmark.
  to: string;
  label: string;
  icon: LucideIcon;
  // Only the "overview" item of each dashboard (the exact /dashboard root) needs
  // exact matching — every other item is itself a leaf path, so default (prefix)
  // matching is harmless there but would make /dashboard permanently "active".
  end?: boolean;
}

interface DashboardShellProps {
  navItems: NavItem[];
  user: AuthUser | null;
  onLogout: () => void;
  children: ReactNode;
}

// Shared shell for both the admin and resident dashboards: a persistent left nav
// rail on desktop, collapsing to a hamburger-triggered slide-out drawer below the
// `md` breakpoint. Only one copy of the nav is ever mounted — its position/
// visibility is toggled with CSS transforms rather than being duplicated per
// breakpoint. Nav items are real <NavLink>s (real URLs, deep-linkable and
// shareable) rather than an ARIA tabs widget over in-memory state — active state
// comes from the current route (NavLink sets aria-current="page" automatically),
// not a controlled prop. A persistent top bar (not mobile-only) carries the
// signed-in user's name — visible regardless of which section is active. Log out
// lives as a link at the bottom of the left nav panel instead (UI-only placement
// choice; behavior is unchanged).
export function DashboardShell({ navItems, user, onLogout, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

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
            <span className="font-display text-lg tracking-wide text-[#EDEFEA]">Saral Society</span>
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

        <nav aria-label="Dashboard sections" className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    isActive ? 'bg-teal-light font-semibold text-teal' : 'text-[#B7BCB2]'
                  }`
                }
              >
                <Icon size={16} /> {item.label}
              </NavLink>
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

        <p className="m-0 mt-2 px-3 text-[10px] text-[#B7BCB2] opacity-60">Designed by Sanket Joshi</p>
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
