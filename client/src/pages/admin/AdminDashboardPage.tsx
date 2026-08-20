import { useQuery } from '@tanstack/react-query';
import { BadgeIndianRupee, Building2, IndianRupee, ReceiptText, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { authedFetch } from '../../lib/api';
import type { ResidentSummary } from '../../types';

interface DashboardSummary {
  totalBilled: number;
  totalPaid: number;
  outstandingTotal: number;
  pendingReviewTotal: number;
  collectionRatePercent: number;
  // docs/other-charges/ — a fully separate pool from the maintenance figures above.
  otherChargesOutstandingTotal: number;
  totalOutstandingTotal: number;
  // docs/manage-finance/ — the society's own income/expenditure, unrelated to the
  // resident-billing figures above.
  societyTotalIncome: number;
  societyTotalExpense: number;
  societyNetPosition: number;
}

interface FlatDues {
  flat: { id: string; wing: string; flatNumber: string };
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
  paidTotal: number;
  outstandingTotal: number;
  creditTotal: number;
}

interface PendingProofsResponse {
  fileUrl: string | null;
}

async function fetchSummary(): Promise<DashboardSummary> {
  const res = await authedFetch('/api/admin/dashboard/summary');
  if (!res.ok) throw new Error('Could not load the dashboard summary.');
  return res.json();
}

async function fetchFlatDues(): Promise<FlatDues[]> {
  const res = await authedFetch('/api/admin/dashboard/flat-dues');
  if (!res.ok) throw new Error('Could not load flat-wise dues.');
  return res.json();
}

// Counts only entries with a proof attached — same criterion PaymentProofsPage
// itself filters by, so this tile's count and the page it links to never disagree.
async function fetchPendingProofsCount(): Promise<number> {
  const res = await authedFetch('/api/admin/ledger-entries?status=PENDING');
  if (!res.ok) throw new Error('Could not load pending proofs.');
  const body = (await res.json()) as PendingProofsResponse[] | PendingProofsResponse;
  return Array.isArray(body) ? body.filter((e) => e.fileUrl).length : 0;
}

function SummaryCard({
  label,
  value,
  accent,
  note,
  to,
}: {
  label: string;
  value: string;
  accent?: 'coral' | 'teal';
  note?: string;
  to?: string;
}) {
  const content = (
    <>
      <p className="m-0 text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`m-0 mt-1 truncate whitespace-nowrap font-mono-brand text-xl font-semibold ${accent === 'coral' ? 'text-coral' : accent === 'teal' ? 'text-teal' : 'text-ink'}`}
      >
        {value}
      </p>
      {note && <p className="m-0 mt-1.5 text-[11px] text-muted">{note}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="block rounded-2xl border border-line bg-white p-5 hover:border-teal">
        {content}
      </Link>
    );
  }

  return <div className="rounded-2xl border border-line bg-white p-5">{content}</div>;
}

// A titled, bordered container grouping one kind of card together (Society,
// Finance, Maintenance, Other Charges) — each SummaryCard is still its own white
// card, but now sits inside a paper-toned panel so a related group visually reads
// as one unit rather than an unbroken 8-card grid with no structure.
function CardGroup({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="mb-5 rounded-2xl border border-line bg-paper p-4">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Icon size={15} className="text-brass" />
        <h2 className="m-0 font-display text-sm text-ink">{title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">{children}</div>
    </div>
  );
}

// Flat-wise dues moved off this page entirely (admin-only /flat-dues, reached only by
// clicking the Outstanding tile below) — this page now only shows society-wide
// headline numbers, never the per-flat table.
export function AdminDashboardPage() {
  const summaryQuery = useQuery({ queryKey: ['admin-dashboard-summary'], queryFn: fetchSummary });
  const duesQuery = useQuery({ queryKey: ['admin-dashboard-flat-dues'], queryFn: fetchFlatDues });
  const pendingProofsQuery = useQuery({
    queryKey: ['admin-dashboard-pending-proofs-count'],
    queryFn: fetchPendingProofsCount,
  });

  const isLoading = summaryQuery.isLoading || duesQuery.isLoading || pendingProofsQuery.isLoading;
  const isError = summaryQuery.isError || duesQuery.isError || pendingProofsQuery.isError;

  // Society-wide available credit — the same per-flat `creditTotal` the flat-wise
  // dues table's "Credit" column shows, just summed across every flat.
  const totalCredits = duesQuery.data?.reduce((sum, row) => sum + row.creditTotal, 0) ?? 0;

  // Occupancy headcounts, derived from the same flat-dues fetch — a flat always has
  // exactly one owner, and at most one current tenant.
  const totalFlats = duesQuery.data?.length ?? 0;
  const totalOwners = new Set(duesQuery.data?.map((row) => row.owner.id)).size;
  const totalTenants = new Set(
    duesQuery.data?.filter((row) => row.currentTenant).map((row) => row.currentTenant!.id),
  ).size;

  return (
    <div className="mx-auto max-w-4xl">
      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load the dashboard.
        </p>
      )}

      {pendingProofsQuery.data !== undefined && (
        <Link
          to="/payment-proofs"
          className="mb-5 flex w-full items-center justify-between rounded-2xl border border-line bg-white p-5 text-left"
        >
          <span className="flex items-center gap-2.5">
            <ReceiptText size={16} className="text-brass" />
            <span className="text-sm font-semibold text-ink">
              {pendingProofsQuery.data} payment proof{pendingProofsQuery.data === 1 ? '' : 's'} pending review
            </span>
          </span>
          <span className="text-xs font-semibold text-teal">Review →</span>
        </Link>
      )}

      {summaryQuery.data && duesQuery.data && (
        <>
          <CardGroup icon={IndianRupee} title="Finance">
            <SummaryCard
              label="Total Outstanding"
              value={`₹${summaryQuery.data.totalOutstandingTotal.toLocaleString('en-IN')}`}
              accent={summaryQuery.data.totalOutstandingTotal > 0 ? 'coral' : undefined}
            />
            <SummaryCard
              label="Total Income"
              value={`₹${summaryQuery.data.societyTotalIncome.toLocaleString('en-IN')}`}
              accent="teal"
            />
            <SummaryCard
              label="Total Expense"
              value={`₹${summaryQuery.data.societyTotalExpense.toLocaleString('en-IN')}`}
              accent="coral"
            />
            <SummaryCard
              label="Net"
              value={`₹${summaryQuery.data.societyNetPosition.toLocaleString('en-IN')}`}
              accent={summaryQuery.data.societyNetPosition >= 0 ? 'teal' : 'coral'}
              note="Recorded since tracking began — not the society's live bank balance."
              to="/manage-finance"
            />
          </CardGroup>

          <CardGroup icon={Wrench} title="Maintenance">
            <SummaryCard
              label="Maintenance Outstanding Total"
              value={`₹${summaryQuery.data.outstandingTotal.toLocaleString('en-IN')}`}
              accent={summaryQuery.data.outstandingTotal > 0 ? 'coral' : undefined}
              note="View flat-wise dues →"
              to="/flat-dues"
            />
            <SummaryCard
              label="Total Maintenance Credit"
              value={`₹${totalCredits.toLocaleString('en-IN')}`}
              accent={totalCredits > 0 ? 'teal' : undefined}
            />
          </CardGroup>

          <CardGroup icon={BadgeIndianRupee} title="Other Charges">
            <SummaryCard
              label="Other Charges Outstanding Total"
              value={`₹${summaryQuery.data.otherChargesOutstandingTotal.toLocaleString('en-IN')}`}
              accent={summaryQuery.data.otherChargesOutstandingTotal > 0 ? 'coral' : undefined}
              note="View flat-wise dues →"
              to="/other-charges-dues"
            />
          </CardGroup>

          <CardGroup icon={Building2} title="Society">
            <SummaryCard
              label="Total Owners"
              value={totalOwners.toLocaleString('en-IN')}
              note="View flats and residents →"
              to="/flats"
            />
            <SummaryCard
              label="Total Flats"
              value={totalFlats.toLocaleString('en-IN')}
              note="View flats and residents →"
              to="/flats"
            />
            <SummaryCard
              label="Total Tenants"
              value={totalTenants.toLocaleString('en-IN')}
              note="View tenants →"
              to="/tenants"
            />
          </CardGroup>
        </>
      )}
    </div>
  );
}
