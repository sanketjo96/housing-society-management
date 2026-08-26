import { ChevronDown, Building2, LogOut, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { AuthUser } from '../../context/AuthContext';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Exact-match only; other items use default prefix matching.
  end?: boolean;
}

// Grouped sidebar entry (e.g. "Settings" with children) — one level deep only.
export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

interface DashboardShellProps {
  navItems: NavEntry[];
  user: AuthUser | null;
  onLogout: () => void;
  children: ReactNode;
}

// Shell for both dashboards: a left nav rail on desktop, a slide-out drawer
// below the `md` breakpoint. One nav instance, toggled via CSS transform.
export function DashboardShell({ navItems, user, onLogout, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Manually-toggled-open groups; a group is also open if its active route is a child.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const location = useLocation();

  function isGroupOpen(group: NavGroup): boolean {
    return openGroups.has(group.label) || group.children.some((child) => location.pathname.startsWith(child.to));
  }

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
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

        <nav
          aria-label="Dashboard sections"
          className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
        >
          {navItems.map((item) => {
            if (isNavGroup(item)) {
              const Icon = item.icon;
              const open = isGroupOpen(item);
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleGroup(item.label)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-[#B7BCB2]"
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={16} /> {item.label}
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="ml-4 flex flex-col gap-1 border-l border-[#334038] pl-3">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) =>
                            `rounded-lg px-3 py-2 text-left text-sm ${
                              isActive ? 'bg-teal-light font-semibold text-teal' : 'text-[#B7BCB2]'
                            }`
                          }
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

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
