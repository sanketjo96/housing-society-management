import { BadgeIndianRupee, Banknote, BookText, Building2, LayoutGrid, ListTree, PlusCircle, Settings, Tag, Users, Wallet, Wallet2, BookOpen, User } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DashboardShell, type NavEntry } from './DashboardShell';

// One shared shell for every authenticated page (mounted once, in App.tsx, as a
// layout route wrapping /dashboard, /flats, /payment-proofs, /settings/*,
// /maintenance-book, /my-details) — the previous design had AdminDashboard and
// ResidentDashboard each own a nested <Routes> tree under a common "/dashboard/*"
// prefix, which made every other page a sub-path of "Dashboard" even though
// Dashboard is really just one page among several. Splitting the routes out to
// their own top-level URLs (see App.tsx) needs exactly one place that still knows
// "which nav items for which role" — this file is that place; it owns no routing
// of its own beyond rendering the matched child via <Outlet/>.
// '/flats', '/tenants', '/flat-dues', '/other-charges-dues', and '/payment-proofs'
// are deliberately not here — all five are still real, admin-only routes (App.tsx),
// but reached only by clicking the corresponding tile on the dashboard
// (AdminDashboardPage: Total Owners/Total Flats → /flats, Total Tenants →
// /tenants, Maintenance Outstanding Total → /flat-dues, Other Charges Outstanding
// Total → /other-charges-dues, "N payment proofs pending review" → /payment-proofs),
// not via the sidebar — each is a read-only/review drill-down of an existing
// dashboard figure, not a primary repeated action.
// '/other-charges' IS a sidebar item (labeled "Custom Bills" below) — it's the
// primary billing action, not a drill-down of an existing dashboard figure, so it's
// deliberately unlinked from the Dashboard card (which instead links to the
// read-only /other-charges-dues table). '/resident-ledger' IS also a sidebar item
// ("Resident Book") — a comprehensive, browsable per-flat overview (every flat,
// both pools combined), distinct from /flat-dues and /other-charges-dues, which are
// exception lists filtered to only what's still owed.
// "Manage Finance" is a submenu group (restructured 2026-08-20, was three separate
// top-level items) — Record (/manage-finance, recording the society's own
// income/expenditure — SocietyLedgerEntry, docs/manage-finance/), Mark Paid
// (/mark-as-paid, the manualDeposit cash/bank-transfer fallback, delinked from
// /payment-proofs the same day since a manualDeposit entry has no proof file and
// never actually appeared in that page's proof-filtered tabs), and Receipt Book
// (/receipt-book, covering issued receipts for both Maintenance and Other Charges —
// its backend query has no category filter, so there's no separate "receipts" entry
// per pool). Grouped together because all three are the admin's day-to-day money
// actions (record income/expense, record a manual payment, look up a receipt), same
// "collapsed group of related screens" pattern the Settings submenu already uses.
// Society details lives inside the Settings submenu, alongside Billing plan and Fee
// types — all three are admin-configuration screens, not primary/repeated actions.
// Manage Finance's supporting category catalog, '/settings/finance-categories',
// lives in the Settings submenu next to Fee types, same convention.
const ADMIN_NAV_ITEMS: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/other-charges', label: 'Custom Bills', icon: BadgeIndianRupee },
  { to: '/resident-ledger', label: 'Resident Book', icon: Users },
  {
    label: 'Manage Finance',
    icon: Wallet2,
    children: [
      { to: '/manage-finance', label: 'Record', icon: PlusCircle },
      { to: '/mark-as-paid', label: 'Mark Paid', icon: Banknote },
      { to: '/receipt-book', label: 'Receipt Book', icon: BookText },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    children: [
      { to: '/settings/society', label: 'Society details', icon: Building2 },
      { to: '/settings/billing', label: 'Billing plan', icon: Wallet },
      { to: '/settings/fee-types', label: 'Fee types', icon: Tag },
      { to: '/settings/finance-categories', label: 'Finance categories', icon: ListTree },
    ],
  },
];

// '/other-charges-book' and '/credit-book' are deliberately not here — reached only
// via the Dashboard's "Other Outstanding"/"Available Maintenance Credit" cards, same
// drill-down convention as the admin side's non-sidebar routes above
// (docs/other-charges/, resident-dashboard restructure). '/maintenance-book' stays a
// sidebar item — it predates that drill-down convention and gained its own Pay
// control without moving off the sidebar.
const RESIDENT_NAV_ITEMS: NavEntry[] = [
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
