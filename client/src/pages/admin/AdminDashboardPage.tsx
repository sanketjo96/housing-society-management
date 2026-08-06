import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Check, Copy, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  outstandingTotal: number;
  unpaidCount: number;
}

interface FlaggedFlat {
  flat: { id: string; wing: string; flatNumber: string };
  recipient: { id: string; name: string; email: string };
  outstandingTotal: number;
  oldestDueDate: string;
  overdueRecordCount: number;
  message: string;
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

async function fetchFlaggedFlats(): Promise<FlaggedFlat[]> {
  const res = await authedFetch('/api/admin/dashboard/flagged-flats');
  if (!res.ok) throw new Error('Could not load flagged flats.');
  return res.json();
}

async function fetchPendingProofsCount(): Promise<number> {
  const res = await authedFetch('/api/admin/ledger-entries?status=PENDING');
  if (!res.ok) throw new Error('Could not load pending proofs.');
  const body = (await res.json()) as PendingProofsResponse[] | PendingProofsResponse;
  return Array.isArray(body) ? body.length : 0;
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: 'coral' | 'teal' }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="m-0 text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`m-0 mt-1 font-mono-brand text-2xl font-semibold ${accent === 'coral' ? 'text-coral' : accent === 'teal' ? 'text-teal' : 'text-ink'}`}
      >
        {value}
      </p>
    </div>
  );
}

// Owns just its own "copied" confirmation state — small and independently stateful,
// same pattern as PaymentProofsPage's per-cell components.
function CopyMessageButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(message).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink"
    >
      {copied ? (
        <>
          <Check size={12} /> Copied
        </>
      ) : (
        <>
          <Copy size={12} /> Copy message
        </>
      )}
    </button>
  );
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminDashboardPage({ onNavigateToProofs }: { onNavigateToProofs?: () => void }) {
  const summaryQuery = useQuery({ queryKey: ['admin-dashboard-summary'], queryFn: fetchSummary });
  const duesQuery = useQuery({ queryKey: ['admin-dashboard-flat-dues'], queryFn: fetchFlatDues });
  const flaggedQuery = useQuery({ queryKey: ['admin-dashboard-flagged-flats'], queryFn: fetchFlaggedFlats });
  const pendingProofsQuery = useQuery({
    queryKey: ['admin-dashboard-pending-proofs-count'],
    queryFn: fetchPendingProofsCount,
  });

  const duesColumns = useMemo<ColumnDef<FlatDues, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
          </span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        cell: ({ row }) => <span className="text-ink">{row.original.owner.name}</span>,
      },
      {
        id: 'tenant',
        header: 'Tenant',
        cell: ({ row }) => <span className="text-ink">{row.original.currentTenant?.name ?? '—'}</span>,
      },
      {
        id: 'outstanding',
        header: 'Outstanding',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span
            className={`font-mono-brand ${row.original.outstandingTotal > 0 ? 'text-coral' : 'text-ink'}`}
          >
            ₹{row.original.outstandingTotal.toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        id: 'unpaidCount',
        header: 'Unpaid',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="text-muted">{row.original.unpaidCount}</span>,
      },
    ],
    [],
  );

  const flaggedColumns = useMemo<ColumnDef<FlaggedFlat, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
          </span>
        ),
      },
      {
        id: 'recipient',
        header: 'Recipient',
        cell: ({ row }) => <span className="text-ink">{row.original.recipient.name}</span>,
      },
      {
        id: 'overdueSince',
        header: 'Overdue since',
        cell: ({ row }) => <span className="text-muted">{dateLabel(row.original.oldestDueDate)}</span>,
      },
      {
        id: 'outstanding',
        header: 'Outstanding',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono-brand text-coral">₹{row.original.outstandingTotal.toLocaleString('en-IN')}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <CopyMessageButton message={row.original.message} />,
      },
    ],
    [],
  );

  const isLoading =
    summaryQuery.isLoading || duesQuery.isLoading || flaggedQuery.isLoading || pendingProofsQuery.isLoading;
  const isError = summaryQuery.isError || duesQuery.isError || flaggedQuery.isError || pendingProofsQuery.isError;

  return (
    <div className="mx-auto max-w-4xl">
      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load the dashboard.
        </p>
      )}

      {summaryQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Outstanding total"
            value={`₹${summaryQuery.data.outstandingTotal.toLocaleString('en-IN')}`}
            accent={summaryQuery.data.outstandingTotal > 0 ? 'coral' : undefined}
          />
          <SummaryCard label="Collection rate" value={`${summaryQuery.data.collectionRatePercent}%`} accent="teal" />
          <SummaryCard
            label="Pending review"
            value={`₹${summaryQuery.data.pendingReviewTotal.toLocaleString('en-IN')}`}
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

      {flaggedQuery.data && flaggedQuery.data.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-coral" />
            <h2 className="m-0 font-display text-base text-ink">Flagged flats</h2>
            <span className="text-xs text-muted">— overdue past the grace period</span>
          </div>
          <DataTable
            data={flaggedQuery.data}
            columns={flaggedColumns}
            getRowId={(f) => f.flat.id}
            emptyMessage="No flagged flats."
          />
        </div>
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
