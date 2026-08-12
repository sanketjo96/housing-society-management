import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { authedFetch } from '../lib/api';

type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

interface MaintenanceRow {
  id: string;
  period: string;
  date: string;
  amount: number;
  settledAmount: number;
  settlementStatus: SettlementStatus;
}

interface LedgerResponse {
  entries: {
    id: string;
    type: string;
    period?: string;
    date: string;
    amount: number;
    settledAmount?: number;
    settlementStatus?: SettlementStatus;
  }[];
  totals: { totalCharges: number };
}

interface MaintenanceBookData {
  rows: MaintenanceRow[];
  totalMaintenanceAmount: number;
}

// Reuses GET /api/me/ledger (no `year` param — lifetime, every SYSTEM charge ever)
// and filters to SYSTEM rows client-side rather than adding a dedicated backend
// endpoint — the data is already there and a flat's full history is at most a
// couple hundred rows. `totals.totalCharges` is always lifetime regardless of any
// `year` param (see ledger.service.ts), so it's exactly the right figure for the
// "Total maintenance amount" card without any extra computation.
async function fetchMaintenanceRecords(): Promise<MaintenanceBookData> {
  const res = await authedFetch('/api/me/ledger');
  if (!res.ok) throw new Error('Could not load your maintenance book.');
  const body: LedgerResponse = await res.json();
  const rows = body.entries
    .filter((e) => e.type === 'SYSTEM')
    .map((e) => ({
      id: e.id,
      period: e.period ?? '',
      date: e.date,
      amount: e.amount,
      settledAmount: e.settledAmount ?? 0,
      settlementStatus: e.settlementStatus ?? 'UNPAID',
    }));
  return { rows, totalMaintenanceAmount: body.totals.totalCharges };
}

const STATUS_META: Record<SettlementStatus, { className: string; label: string }> = {
  PAID: { className: 'bg-teal-light text-teal', label: 'Paid' },
  PARTIALLY_SETTLED: { className: 'bg-amber-light text-brass', label: 'Partially settled' },
  UNPAID: { className: 'bg-coral-light text-coral', label: 'Unpaid' },
};

function SettlementBadge({ row }: { row: MaintenanceRow }) {
  const meta = STATUS_META[row.settlementStatus];
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
        {meta.label}
      </span>
      {row.settlementStatus === 'PARTIALLY_SETTLED' && (
        <span className="font-mono-brand text-[11px] text-muted">
          ₹{row.settledAmount.toLocaleString('en-IN')} of ₹{row.amount.toLocaleString('en-IN')}
        </span>
      )}
    </div>
  );
}

function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

type SortKey = 'date' | 'amount';
type SortDir = 'asc' | 'desc';

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 bg-transparent p-0 font-semibold ${active ? 'text-ink' : 'text-muted'}`}
    >
      {label} <Icon size={12} />
    </button>
  );
}

// SYSTEM-charges-only view — the resident-view restructure's "Maintenance Book" nav
// item, sibling to the Dashboard (which shows Deposit rows only). "Status" is a real,
// per-record Unpaid/Partially settled/Paid badge — derived server-side by FIFO-filling
// the flat's approved deposits across its records oldest-first (see CLAUDE.md's
// settlement-tracking addendum; ledger.service.ts's computeRecordSettlements). Lifetime
// view, no year concept — only the date-range filter narrows what's shown.
export function MaintenanceBookPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-maintenance-records'],
    queryFn: fetchMaintenanceRecords,
  });
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = data.rows.filter((r) => {
      const d = r.date.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const cmp = sortKey === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, fromDate, toDate]);

  const columns = useMemo<ColumnDef<MaintenanceRow, unknown>[]>(
    () => [
      {
        id: 'date',
        header: () => <SortableHeader label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={handleSort} />,
        cell: ({ row }) => <span className="font-mono-brand text-ink">{periodLabel(row.original.period)}</span>,
      },
      {
        id: 'amount',
        header: () => (
          <SortableHeader label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
        ),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">₹{row.original.amount.toLocaleString('en-IN')}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { align: 'right' },
        cell: ({ row }) => <SettlementBadge row={row.original} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortKey, sortDir],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Maintenance book</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your maintenance book.
        </p>
      )}

      {data && (
        <>
          <div className="mb-5 rounded-2xl border border-ink bg-ink p-5">
            <p className="m-0 text-xs uppercase tracking-wide text-[#B7BCB2]">Total maintenance amount</p>
            <p className="m-0 mt-1 font-mono-brand text-2xl font-semibold text-white">
              ₹{data.totalMaintenanceAmount.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-muted">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 block rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 block rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
              />
            </label>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs font-semibold text-ink"
              >
                Clear
              </button>
            )}
          </div>

          <DataTable data={rows} columns={columns} getRowId={(r) => r.id} emptyMessage="No maintenance records yet." />
        </>
      )}
    </div>
  );
}
