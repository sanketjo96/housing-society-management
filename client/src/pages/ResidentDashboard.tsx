import { BookOpen, LayoutGrid, User } from 'lucide-react';
import { useState } from 'react';
import { DashboardShell, type NavItem } from '../components/DashboardShell';
import { useAuth } from '../context/AuthContext';
import { MaintenanceBookPage } from './MaintenanceBookPage';
import { MyDetailsPage } from './MyDetailsPage';
import { ResidentDashboardOverview } from './ResidentDashboardOverview';

type ResidentTabKey = 'dashboard' | 'maintenance-book' | 'my-details';

const RESIDENT_NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { key: 'maintenance-book', label: 'Maintenance Book', icon: BookOpen },
  { key: 'my-details', label: 'My details', icon: User },
];

export function ResidentDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<ResidentTabKey>('dashboard');

  return (
    <DashboardShell
      navItems={RESIDENT_NAV_ITEMS}
      activeKey={tab}
      onSelectKey={(key) => setTab(key as ResidentTabKey)}
      user={user}
      onLogout={() => void logout()}
    >
      {tab === 'dashboard' && (
        <div role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
          <ResidentDashboardOverview />
        </div>
      )}
      {tab === 'maintenance-book' && (
        <div role="tabpanel" id="tabpanel-maintenance-book" aria-labelledby="tab-maintenance-book">
          <MaintenanceBookPage />
        </div>
      )}
      {tab === 'my-details' && (
        <div role="tabpanel" id="tabpanel-my-details" aria-labelledby="tab-my-details">
          <MyDetailsPage />
        </div>
      )}
    </DashboardShell>
  );
}
