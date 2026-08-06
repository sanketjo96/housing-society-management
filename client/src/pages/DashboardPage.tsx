import { LayoutGrid, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { FlatsListPage } from './admin/FlatsListPage';
import type { AuthUser } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { MyDetailsPage } from './MyDetailsPage';

type TabKey = 'dashboard' | 'my-details' | 'flats';

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

// Dashboard is empty (real widgets are Phase 8) but every role sees it, matching both
// shared UI mockups' shape: a tab bar with "Dashboard" always first. "My details" is
// resident-only (an ADMIN has no flat — GET /api/me/flat is 403 for that role, Task
// 3.7); "Flats and residents" is admin-only (Task 3.1-3.6). No role sees both.
function tabsForRole(role: AuthUser['role'] | undefined): TabDef[] {
  const tabs: TabDef[] = [{ key: 'dashboard', label: 'Dashboard', icon: LayoutGrid }];
  if (role === 'OWNER' || role === 'TENANT') {
    tabs.push({ key: 'my-details', label: 'My details', icon: User });
  }
  if (role === 'ADMIN') {
    tabs.push({ key: 'flats', label: 'Flats and residents', icon: Users });
  }
  return tabs;
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<TabKey>('dashboard');
  const tabs = tabsForRole(user?.role);

  return (
    <main className="min-h-dvh bg-paper p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="m-0 font-display text-xl text-ink">Dashboard</p>
            <p className="m-0 mt-0.5 text-xs text-muted">
              {user ? `${user.name} · ${user.role}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink"
          >
            Log out
          </button>
        </div>

        <div role="tablist" aria-label="Dashboard sections" className="mb-6 flex gap-1 border-b border-line">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={active}
                aria-controls={`tabpanel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`mr-5 flex items-center gap-1.5 border-b-2 bg-transparent px-1 py-2 text-sm ${
                  active ? 'border-teal font-semibold text-ink' : 'border-transparent text-muted'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'dashboard' && (
          <div
            role="tabpanel"
            id="tabpanel-dashboard"
            aria-labelledby="tab-dashboard"
            className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted"
          >
            Dashboard widgets are coming in a later phase.
          </div>
        )}
        {tab === 'my-details' && (
          <div role="tabpanel" id="tabpanel-my-details" aria-labelledby="tab-my-details">
            <MyDetailsPage />
          </div>
        )}
        {tab === 'flats' && (
          <div role="tabpanel" id="tabpanel-flats" aria-labelledby="tab-flats">
            <FlatsListPage />
          </div>
        )}
      </div>
    </main>
  );
}
