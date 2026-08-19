import { BadgeIndianRupee, BookText, Building2, LayoutGrid, Tag, Wallet, BookOpen, User } from 'lucide-react';
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
// '/flats', '/tenants', '/flat-dues', and '/payment-proofs' are deliberately not
// here — all four are still real, admin-only routes (App.tsx), but reached only by
// clicking the corresponding tile on the dashboard (AdminDashboardPage: Total
// Owners/Total Flats → /flats, Total Tenants → /tenants, Maintenance Outstanding
// Total → /flat-dues, the "N payment proofs pending review" widget →
// /payment-proofs), not via the sidebar. '/other-charges' IS a sidebar item
// (docs/other-charges/), unlike those four — it's a primary, repeated admin
// action (billing a charge), not a drill-down of an existing dashboard figure.
const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/other-charges', label: 'Other Charges', icon: BadgeIndianRupee },
  { to: '/receipt-book', label: 'Receipt Book', icon: BookText },
  { to: '/settings/society', label: 'Society details', icon: Building2 },
  { to: '/settings/billing', label: 'Billing plan', icon: Wallet },
  { to: '/settings/fee-types', label: 'Fee types', icon: Tag },
];

// '/other-charges-book' is deliberately not here — reached only via the
// Dashboard's "Other Outstanding" card, same drill-down convention as the admin
// side's non-sidebar routes above (docs/other-charges/).
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
