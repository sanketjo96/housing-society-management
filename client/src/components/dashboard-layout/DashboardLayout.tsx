import { BadgeIndianRupee, Banknote, BookText, Building2, Car, LayoutGrid, ListTree, MessageSquareWarning, PlusCircle, Settings, Tag, Upload, Users, Wallet, Wallet2, BookOpen, User } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardShell, type NavEntry } from '../dashboard-shell/DashboardShell';

// Shared layout for every authenticated page — owns which nav items show per
// role, renders the matched child via <Outlet/>. '/flats', '/tenants',
// '/resident-ledger', and '/payment-proofs' are real routes but not sidebar
// items — reached only via dashboard tiles (read-only drill-downs). All three
// Outstanding-section tiles on the dashboard now point at '/resident-ledger'
// (2026-08-29) — '/flat-dues' and '/other-charges-dues' are unlinked from any
// nav surface as a result, kept only as still-working direct routes.
// '/vehicle-finder' is Owner-sidebar-only as of 2026-08-30 — the route itself
// (App.tsx) still allows ADMIN/OWNER/TENANT, so Admin/Tenant can still reach
// it directly by URL, just without a nav link.
const ADMIN_NAV_ITEMS: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/other-charges', label: 'Other Charges', icon: BadgeIndianRupee },
  // Status moderation only — admin never edits/deletes complaint content
  // (docs/features/complaints/ Confirmed Product Decision #6).
  { to: '/admin/complaints', label: 'Complaints', icon: MessageSquareWarning },
  {
    label: 'Manage Finance',
    icon: Wallet2,
    children: [
      { to: '/manage-finance', label: 'Society Records', icon: PlusCircle },
      { to: '/receipt-book', label: 'Receipt Records', icon: BookText },
      { to: '/mark-as-paid', label: 'Offline Payments', icon: Banknote },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    children: [
      { to: '/settings/society', label: 'Society Details', icon: Building2 },
      { to: '/settings/billing', label: 'Billing Plan', icon: Wallet },
      { to: '/settings/fee-types', label: 'Custom Fees', icon: Tag },
      { to: '/settings/finance-categories', label: 'Finance Categories', icon: ListTree },
    ],
  },
  // CSV bulk-import utilities, one child per import type.
  {
    label: 'Imports',
    icon: Upload,
    children: [
      { to: '/imports/residents', label: 'Resident', icon: Users },
      { to: '/imports/charges', label: 'Charges', icon: BadgeIndianRupee },
      { to: '/imports/finance', label: 'Finance', icon: Banknote },
    ],
  },
];

// Base resident nav, shared by OWNER and TENANT alike — '/other-charges-book'
// is reached only via the Dashboard's "Other Outstanding" card.
const RESIDENT_NAV_ITEMS: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/my-details', label: 'My Details', icon: User },
  { to: '/maintenance-book', label: 'Maintenance Book', icon: BookOpen },
];

// Owner-only additions to the resident nav. Complaints: tenants have no
// access at all, not even read-only (docs/features/complaints/ Confirmed
// Product Decision #1). Vehicle Finder: sidebar link is Owner-only as of
// 2026-08-30 (see top-of-file note) — a product/nav-placement choice, not a
// route restriction.
const OWNER_ONLY_NAV_ITEMS: NavEntry[] = [
  { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { to: '/vehicle-finder', label: 'Vehicle Finder', icon: Car },
];

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navItems =
    user?.role === 'ADMIN'
      ? ADMIN_NAV_ITEMS
      : user?.role === 'OWNER'
        ? [...RESIDENT_NAV_ITEMS, ...OWNER_ONLY_NAV_ITEMS]
        : RESIDENT_NAV_ITEMS;

  return (
    <DashboardShell navItems={navItems} user={user} onLogout={() => void logout()}>
      <Outlet />
    </DashboardShell>
  );
}
