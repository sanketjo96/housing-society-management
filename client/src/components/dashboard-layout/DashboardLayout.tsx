import { BadgeIndianRupee, Banknote, BookText, Building2, Car, LayoutGrid, ListTree, MessageSquareWarning, PlusCircle, Settings, Tag, Upload, Users, Wallet, Wallet2, BookOpen, User } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardShell, type NavEntry } from '../dashboard-shell/DashboardShell';

// Shared layout for every authenticated page — owns which nav items show per
// role, renders the matched child via <Outlet/>. '/flats', '/tenants',
// '/flat-dues', '/other-charges-dues', and '/payment-proofs' are real routes
// but not sidebar items — reached only via dashboard tiles (read-only drill-downs).
const ADMIN_NAV_ITEMS: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/other-charges', label: 'Other Charges', icon: BadgeIndianRupee },
  { to: '/resident-ledger', label: 'Resident Book', icon: Users },
  // Not persona-restricted — available to residents too (docs/features/vehicle-finder/).
  { to: '/vehicle-finder', label: 'Vehicle Finder', icon: Car },
  // Status moderation only — admin never edits/deletes complaint content
  // (docs/features/complaints/ Confirmed Product Decision #6).
  { to: '/admin/complaints', label: 'Complaints', icon: MessageSquareWarning },
  {
    label: 'Manage Finance',
    icon: Wallet2,
    children: [
      { to: '/manage-finance', label: 'Record', icon: PlusCircle },
      { to: '/mark-as-paid', label: 'Mark Paid', icon: Banknote },
      { to: '/receipt-book', label: 'Receipt Book', icon: BookText },
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
];

// '/other-charges-book' is reached only via the Dashboard's "Other Outstanding" card.
const RESIDENT_NAV_ITEMS: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/maintenance-book', label: 'Maintenance Book', icon: BookOpen },
  { to: '/my-details', label: 'My Details', icon: User },
  { to: '/vehicle-finder', label: 'Vehicle Finder', icon: Car },
];

// Owner-only addition to the resident nav — tenants have no access at all,
// not even read-only (docs/features/complaints/ Confirmed Product Decision #1).
const OWNER_ONLY_NAV_ITEMS: NavEntry[] = [
  { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning },
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
