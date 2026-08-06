import { BookOpen, LayoutGrid, ReceiptText, Settings as SettingsIcon, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { FlatsListPage } from './admin/FlatsListPage';
import { PaymentProofsPage } from './admin/PaymentProofsPage';
import { SettingsPage } from './admin/SettingsPage';
import type { AuthUser } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { MyDetailsPage } from './MyDetailsPage';
import { PassbookPage } from './PassbookPage';

type TabKey = 'dashboard' | 'passbook' | 'my-details' | 'flats' | 'payment-proofs' | 'settings';

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

// Every role sees the Dashboard tab first, matching both shared UI mockups' shape.
// "Passbook" and "My details" are resident-only (an ADMIN has no flat and isn't
// billed — GET /api/me/flat and /api/me/ledger are both 403 for that role, Tasks
// 3.7/4.5); "Flats and residents", "Payment proofs", and "Settings" are admin-only
// (Task 3.1-3.6; "Payment proofs" is Task 6.9; Settings added 2026-08-06 for the
// tenant-rate-factor/default-base-rate admin UI). No role sees both resident and admin
// tabs.
function tabsForRole(role: AuthUser['role'] | undefined): TabDef[] {
  const tabs: TabDef[] = [{ key: 'dashboard', label: 'Dashboard', icon: LayoutGrid }];
  if (role === 'OWNER' || role === 'TENANT') {
    tabs.push({ key: 'passbook', label: 'Passbook', icon: BookOpen });
    tabs.push({ key: 'my-details', label: 'My details', icon: User });
  }
  if (role === 'ADMIN') {
    tabs.push({ key: 'flats', label: 'Flats and residents', icon: Users });
    tabs.push({ key: 'payment-proofs', label: 'Payment proofs', icon: ReceiptText });
    tabs.push({ key: 'settings', label: 'Settings', icon: SettingsIcon });
  }
  return tabs;
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<TabKey>('dashboard');
  const tabs = tabsForRole(user?.role);

  return (
    <main className="min-h-dvh bg-paper p-4 sm:p-6">
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

        <div
          role="tablist"
          aria-label="Dashboard sections"
          className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
        >
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
                className={`mr-5 flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 bg-transparent px-1 py-2 text-sm ${
                  active ? 'border-teal font-semibold text-ink' : 'border-transparent text-muted'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'dashboard' && (
          <div role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
            {user?.role === 'ADMIN' ? (
              <AdminDashboardPage onNavigateToProofs={() => setTab('payment-proofs')} />
            ) : (
              <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
                Dashboard widgets are coming in a later phase.
              </div>
            )}
          </div>
        )}
        {tab === 'passbook' && (
          <div role="tabpanel" id="tabpanel-passbook" aria-labelledby="tab-passbook">
            <PassbookPage />
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
        {tab === 'payment-proofs' && (
          <div role="tabpanel" id="tabpanel-payment-proofs" aria-labelledby="tab-payment-proofs">
            <PaymentProofsPage />
          </div>
        )}
        {tab === 'settings' && (
          <div role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings">
            <SettingsPage />
          </div>
        )}
      </div>
    </main>
  );
}
