import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Heart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/data-table/DataTable';
import { SummaryCard } from '../_shared/components/ledger-entry-display/LedgerEntryDisplay';
import { useAuth } from '../../context/AuthContext';
import { authedFetch } from '../../lib/api';

interface DashboardComplaint {
  id: string;
  title: string;
  possibleSolution: string;
  owner: { id: string; name: string };
  flat: { wing: string; flatNumber: string };
  upvoteCount: number;
  myUpvoted: boolean;
}

interface BalancesSummary {
  maintenance: { outstanding: number; availableCredit: number };
  otherCharges: { outstanding: number };
  totalOutstanding: number;
  availableYears: number[];
  // Omitted (or empty) for a TENANT caller — Complaints is owner-only to
  // view, not just to log. Already sorted by upvote count descending.
  complaints?: DashboardComplaint[];
}

async function fetchMyBalances(year?: number): Promise<BalancesSummary> {
  const res = await authedFetch(`/api/me/balances${year ? `?year=${year}` : ''}`);
  if (!res.ok) throw new Error('Could not load your balances.');
  return res.json();
}

// Pure navigation hub: 4 summary cards, one per balance pool. Maintenance
// Outstanding and Available Credit link to /maintenance-book (where Pay lives),
// Other Outstanding to /other-charges-book. Total Outstanding has no drill-down —
// it's the sum of the other two. 'ALL' means no year filter — lifetime figures,
// the same as before this dropdown existed.
export function ResidentDashboardOverview() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState<'ALL' | number>('ALL');
  const year = selectedYear === 'ALL' ? undefined : selectedYear;
  const [upvoteError, setUpvoteError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-balances', year],
    queryFn: () => fetchMyBalances(year),
  });

  // Same toggle endpoint ComplaintsPage.tsx uses — any owner can upvote any
  // complaint, including their own, from either surface.
  const upvoteMutation = useMutation<unknown, Error, { id: string; nowUpvoted: boolean }>({
    mutationFn: async ({ id, nowUpvoted }) => {
      const res = await authedFetch(`/api/complaints/${id}/upvote`, {
        method: nowUpvoted ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error('Could not update your upvote.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-balances', year] }),
    onError: (err) => setUpvoteError(err.message),
  });

  const complaints = data?.complaints ?? [];
  // Same column shape as AdminComplaintsPage.tsx's "Complaint"/"Raised by"
  // pair (title+subtitle, flat+owner subtitle) — status, image, and
  // priority are deliberately left off this compact dashboard preview.
  const complaintColumns = useMemo<ColumnDef<DashboardComplaint, unknown>[]>(
    () => [
      {
        id: 'complaint',
        header: 'Complaint',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.title}
            <div className="text-xs text-muted">{row.original.possibleSolution}</div>
          </span>
        ),
      },
      {
        id: 'raisedBy',
        header: 'Raised by',
        meta: { headerClassName: 'w-36', cellClassName: 'w-36 max-w-36' },
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
            <div className="text-xs text-muted">{row.original.owner.name}</div>
          </span>
        ),
      },
      {
        id: 'upvotes',
        header: 'Upvotes',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const complaint = row.original;
          return (
            <button
              type="button"
              onClick={() =>
                upvoteMutation.mutate({ id: complaint.id, nowUpvoted: !complaint.myUpvoted })
              }
              aria-label={
                complaint.myUpvoted
                  ? `Remove upvote from ${complaint.title}`
                  : `Upvote ${complaint.title}`
              }
              aria-pressed={complaint.myUpvoted}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                complaint.myUpvoted ? 'border-coral bg-coral-light text-coral' : 'border-line text-muted'
              }`}
            >
              <Heart size={12} fill={complaint.myUpvoted ? 'currentColor' : 'none'} />{' '}
              {complaint.upvoteCount}
            </button>
          );
        },
      },
    ],
    [upvoteMutation],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Dashboard</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your dashboard.
        </p>
      )}

      {data && (
        <>
          <div className="mb-4 flex items-center justify-end gap-2">
            <label htmlFor="resident-dashboard-year" className="text-xs font-semibold text-muted">
              Year
            </label>
            <select
              id="resident-dashboard-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
            >
              <option value="ALL">All</option>
              {data.availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4">
            <SummaryCard
              label="Total Outstanding"
              value={data.totalOutstanding}
              accent={data.totalOutstanding > 0 ? 'coral' : undefined}
            />
            <SummaryCard
              label="Maintenance Outstanding"
              value={data.maintenance.outstanding}
              accent={data.maintenance.outstanding > 0 ? 'coral' : undefined}
              to="/maintenance-book"
            />
            <SummaryCard
              label="Other Outstanding"
              value={data.otherCharges.outstanding}
              accent={data.otherCharges.outstanding > 0 ? 'coral' : undefined}
              to="/other-charges-book"
            />
            <SummaryCard
              label="Available Maintenance Credit"
              value={data.maintenance.availableCredit}
              accent={data.maintenance.availableCredit > 0 ? 'teal' : undefined}
              to="/maintenance-book"
            />
          </div>

          {data.totalOutstanding === 0 && (
            <p className="m-0 flex items-center gap-1.5 text-sm font-semibold text-teal">
              <CheckCircle2 size={16} /> Nothing outstanding right now
            </p>
          )}

          {user?.role === 'OWNER' && (
            <div className="mt-6">
              <h2 className="m-0 mb-3 font-display text-base text-ink">Community Complaints</h2>
              {upvoteError && (
                <p role="alert" className="mb-2 text-sm text-coral">
                  {upvoteError}
                </p>
              )}
              <DataTable
                data={complaints}
                columns={complaintColumns}
                getRowId={(c) => c.id}
                emptyMessage="No complaints yet."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
