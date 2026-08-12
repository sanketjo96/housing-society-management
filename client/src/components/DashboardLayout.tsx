import { Building2, LayoutGrid, Receipt as ReceiptIcon, ReceiptText, Users, Wallet, BookOpen, User } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DashboardShell, type NavItem } from './DashboardShell';

// One shared shell for every authenticated page (mounted once, in App.tsx, as a
// layout route wrapping /dashboard, /flats, /payment-proofs, /settings/*,
// /maintenance-book, /my-details) — the previous design had AdminDashboard and
// ResidentDashboard each own a nested <Routes> tree under a common "/dashboard/*"
// prefix, which made every other page a sub-path of "Dashboard" even though
// Dashboard is really just one page among several. Splitting the routes out to
// their own top-level URLs (see App.tsx) needs exactly one place that still knows
// "which nav items for which role" — this file is that place; it owns no routing
// of its own beyond rendering the matched child via <Outlet/>.
const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/flats', label: 'Flats and residents', icon: Users },
  { to: '/payment-proofs', label: 'Payment proofs', icon: ReceiptText },
  { to: '/settings/society', label: 'Society details', icon: Building2 },
  { to: '/settings/billing', label: 'Billing plan', icon: Wallet },
  { to: '/settings/receipt-template', label: 'Receipt template', icon: ReceiptIcon },
];

const RESIDENT_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/maintenance-book', label: 'Maintenance Book', icon: BookOpen },
  { to: '/my-details', label: 'My details', icon: User },
];

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navItems = user?.role === 'ADMIN' ? ADMIN_NAV_ITEMS : RESIDENT_NAV_ITEMS;

  return (
    <DashboardShell navItems={navItems} user={user} onLogout={() => void logout()}>
      <Outlet />
    </DashboardShell>
  );
}
