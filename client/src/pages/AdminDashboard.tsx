import { LayoutGrid, ReceiptText, Settings as SettingsIcon, Users } from 'lucide-react';
import { useState } from 'react';
import { DashboardShell, type NavItem } from '../components/DashboardShell';
import { useAuth } from '../context/AuthContext';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { FlatsListPage } from './admin/FlatsListPage';
import { PaymentProofsPage } from './admin/PaymentProofsPage';
import { SettingsPage } from './admin/SettingsPage';

type AdminTabKey = 'dashboard' | 'flats' | 'payment-proofs' | 'settings';

const ADMIN_NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { key: 'flats', label: 'Flats and residents', icon: Users },
  { key: 'payment-proofs', label: 'Payment proofs', icon: ReceiptText },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<AdminTabKey>('dashboard');

  return (
    <DashboardShell
      navItems={ADMIN_NAV_ITEMS}
      activeKey={tab}
      onSelectKey={(key) => setTab(key as AdminTabKey)}
      user={user}
      onLogout={() => void logout()}
    >
      {tab === 'dashboard' && (
        <div role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
          <AdminDashboardPage onNavigateToProofs={() => setTab('payment-proofs')} />
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
    </DashboardShell>
  );
}
