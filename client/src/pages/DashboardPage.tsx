import { useAuth } from '../context/AuthContext';
import { AdminDashboard } from './AdminDashboard';
import { ResidentDashboard } from './ResidentDashboard';

// The only ADMIN-vs-resident conditional in the dashboard tree — AdminDashboard and
// ResidentDashboard each own their own nav items and tab content outright, so no
// role branching leaks into the shared DashboardShell or any tab-content component.
export function DashboardPage() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <AdminDashboard /> : <ResidentDashboard />;
}
