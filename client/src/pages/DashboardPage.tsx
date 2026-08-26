import { useAuth } from '../context/AuthContext';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { ResidentDashboardOverview } from './ResidentDashboardOverview';

// Picks which dashboard overview a role sees; nav shell lives in DashboardLayout.
export function DashboardPage() {
  const { user } = useAuth();

  return user?.role === 'ADMIN' ? <AdminDashboardPage /> : <ResidentDashboardOverview />;
}
