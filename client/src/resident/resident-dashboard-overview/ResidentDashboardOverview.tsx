import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/data-table/DataTable';
import { SummaryCard } from '../_shared/components/ledger-entry-display/LedgerEntryDisplay';
import { useAuth } from '../../context/AuthContext';
import { authedFetch } from '../../lib/api';

interface DashboardComplaint {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
  flat: { wing: string; flatNumber: string };
  upvoteCount: number;
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

const PRIORITY_LABEL: Record<DashboardComplaint['priority'], string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

const STATUS_LABEL: Record<DashboardComplaint['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-balances', year],
    queryFn: () => fetchMyBalances(year),
  });

  const complaints = data?.complaints ?? [];
  const complaintColumns = useMemo<ColumnDef<DashboardComplaint, unknown>[]>(
    () => [
      { id: 'title', header: 'Title', cell: ({ row }) => row.original.title },
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => `${row.original.flat.wing}-${row.original.flat.flatNumber}`,
      },
      {
        id: 'priority',
        header: 'Priority',
        cell: ({ row }) => PRIORITY_LABEL[row.original.priority],
      },
      { id: 'status', header: 'Status', cell: ({ row }) => STATUS_LABEL[row.original.status] },
      {
        id: 'upvotes',
        header: 'Upvotes',
        meta: { align: 'right' },
        cell: ({ row }) => row.original.upvoteCount,
      },
    ],
    [],
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
