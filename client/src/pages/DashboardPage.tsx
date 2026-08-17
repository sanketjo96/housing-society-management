import { useAuth } from '../context/AuthContext';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { ResidentDashboardOverview } from './ResidentDashboardOverview';

// The element for the "/dashboard" route only — the shared nav shell now lives one
// level up, in DashboardLayout (mounted by App.tsx), so this component's only job
// is picking which overview content a role sees. It no longer owns any routing of
// its own (no nested <Routes>, no catch-all) — every other page is its own
// sibling top-level route in App.tsx, not a sub-path of this one.
export function DashboardPage() {
  const { user } = useAuth();

  return user?.role === 'ADMIN' ? <AdminDashboardPage /> : <ResidentDashboardOverview />;
}
