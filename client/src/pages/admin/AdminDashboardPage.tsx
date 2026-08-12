import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ReceiptText } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '../../components/DataTable';
import { authedFetch } from '../../lib/api';
import type { ResidentSummary } from '../../types';

interface DashboardSummary {
  totalBilled: number;
  totalPaid: number;
  outstandingTotal: number;
  pendingReviewTotal: number;
  collectionRatePercent: number;
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
  length: number;
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

async function fetchPendingProofsCount(): Promise<number> {
  const res = await authedFetch('/api/admin/ledger-entries?status=PENDING');
  if (!res.ok) throw new Error('Could not load pending proofs.');
  const body = (await res.json()) as PendingProofsResponse[] | PendingProofsResponse;
  return Array.isArray(body) ? body.length : 0;
}

function SummaryCard({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: string;
  accent?: 'coral' | 'teal';
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="m-0 text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`m-0 mt-1 truncate whitespace-nowrap font-mono-brand text-xl font-semibold ${accent === 'coral' ? 'text-coral' : accent === 'teal' ? 'text-teal' : 'text-ink'}`}
      >
        {value}
      </p>
      {note && <p className="m-0 mt-1.5 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

export function AdminDashboardPage({ onNavigateToProofs }: { onNavigateToProofs?: () => void }) {
  const summaryQuery = useQuery({ queryKey: ['admin-dashboard-summary'], queryFn: fetchSummary });
  const duesQuery = useQuery({ queryKey: ['admin-dashboard-flat-dues'], queryFn: fetchFlatDues });
  const pendingProofsQuery = useQuery({
    queryKey: ['admin-dashboard-pending-proofs-count'],
    queryFn: fetchPendingProofsCount,
  });

  const duesColumns = useMemo<ColumnDef<FlatDues, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        accessorFn: (row) => `${row.flat.wing}-${row.flat.flatNumber}`,
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
          </span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        accessorFn: (row) => row.owner.name,
        cell: ({ row }) => (
          <div>
            <span className="text-ink">{row.original.owner.name}</span>
            {row.original.currentTenant && (
              <p className="m-0 text-xs text-muted">Tenant: {row.original.currentTenant.name}</p>
            )}
          </div>
        ),
      },
      {
        id: 'outstanding',
        header: 'Outstanding',
        accessorFn: (row) => row.outstandingTotal,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span
            className={`font-mono-brand ${row.original.outstandingTotal > 0 ? 'text-coral' : 'text-ink'}`}
          >
            ₹{row.original.outstandingTotal.toLocaleString('en-IN')}
          </span>
        ),
      },
      // 'Paid' column (row.paidTotal) hidden for now — FlatDues still returns
      // paidTotal, only this column definition was removed.
      {
        id: 'credit',
        header: 'Credit',
        accessorFn: (row) => row.creditTotal,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className={`font-mono-brand ${row.original.creditTotal > 0 ? 'text-teal' : 'text-muted'}`}>
            ₹{row.original.creditTotal.toLocaleString('en-IN')}
          </span>
        ),
      },
    ],
    [],
  );

  const isLoading = summaryQuery.isLoading || duesQuery.isLoading || pendingProofsQuery.isLoading;
  const isError = summaryQuery.isError || duesQuery.isError || pendingProofsQuery.isError;

  // Society-wide available credit — the same per-flat `creditTotal` the "Credit"
  // table column below already shows, just summed across every flat. No new
  // backend endpoint needed: duesQuery already fetches this per flat.
  const totalCredits = duesQuery.data?.reduce((sum, row) => sum + row.creditTotal, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load the dashboard.
        </p>
      )}

      {summaryQuery.data && duesQuery.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Maintenance Outstanding Total"
            value={`₹${summaryQuery.data.outstandingTotal.toLocaleString('en-IN')}`}
            accent={summaryQuery.data.outstandingTotal > 0 ? 'coral' : undefined}
          />
          <SummaryCard
            label="Maintenance Collection Rate"
            value={`${summaryQuery.data.collectionRatePercent}%`}
            accent="teal"
            note="Share of total dues actually paid in so far. Approved credit adjustments aren't counted."
          />
          <SummaryCard
            label="Pending review"
            value={`₹${summaryQuery.data.pendingReviewTotal.toLocaleString('en-IN')}`}
          />
          <SummaryCard
            label="Total Credits"
            value={`₹${totalCredits.toLocaleString('en-IN')}`}
            accent={totalCredits > 0 ? 'teal' : undefined}
          />
        </div>
      )}

      {pendingProofsQuery.data !== undefined && (
        <button
          type="button"
          onClick={onNavigateToProofs}
          className="mb-6 flex w-full items-center justify-between rounded-2xl border border-line bg-white p-5 text-left"
        >
          <span className="flex items-center gap-2.5">
            <ReceiptText size={16} className="text-brass" />
            <span className="text-sm font-semibold text-ink">
              {pendingProofsQuery.data} payment proof{pendingProofsQuery.data === 1 ? '' : 's'} pending review
            </span>
          </span>
          <span className="text-xs font-semibold text-teal">Review →</span>
        </button>
      )}

      {duesQuery.data && (
        <div>
          <h2 className="m-0 mb-3 font-display text-base text-ink">Flat-wise dues</h2>
          <DataTable
            data={duesQuery.data}
            columns={duesColumns}
            getRowId={(d) => d.flat.id}
            emptyMessage="No flats yet."
          />
        </div>
      )}
    </div>
  );
}
