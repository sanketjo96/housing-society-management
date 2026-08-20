import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, CheckCircle2, QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { ErrorBanner } from '../components/FormField';
import {
  ApprovalBadge,
  type ApprovalStatus,
  dateLabel,
  ReceiptDownloadButton,
  SummaryCard,
} from '../components/LedgerEntryDisplay';
import { fetchOpenIntent, PayIntentPanel } from '../components/PayIntentPanel';
import { authedFetch } from '../lib/api';
import { useIsMobile } from '../lib/use-is-mobile';

type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

interface OtherChargeRow {
  id: string;
  feeTypeName?: string;
  date: string;
  amount: number;
  settledAmount: number;
  settlementStatus: SettlementStatus;
}

interface DepositRow {
  id: string;
  date: string;
  amount: number;
  status: ApprovalStatus;
  hasReceipt: boolean;
}

interface LedgerResponse {
  entries: {
    id: string;
    type: string;
    feeTypeName?: string;
    date: string;
    amount: number;
    status?: string;
    settledAmount?: number;
    settlementStatus?: SettlementStatus;
    hasReceipt?: boolean;
  }[];
  totals: { totalCharges: number; outstanding: number };
}

interface OtherChargesBookData {
  chargeRows: OtherChargeRow[];
  depositRows: DepositRow[];
  totalOtherChargesAmount: number;
  outstanding: number;
}

// Mirrors MaintenanceBookPage.tsx's shape exactly — its own Outstanding, its own
// charges list, its own Pay flow, and its own Payment History (docs/other-charges/).
// Reuses GET /api/me/ledger with category=OTHER_CHARGE (no separate backend
// endpoint, same "the data is already there" reasoning as Maintenance Book) and
// filters client-side into the two tables this page shows (OTHER_CHARGE charges and
// DEPOSIT history). `totals` is always lifetime regardless of any `year` param (see
// ledger.service.ts), so it's exactly right for both cards without extra computation.
async function fetchOtherChargesBook(): Promise<OtherChargesBookData> {
  const res = await authedFetch('/api/me/ledger?category=OTHER_CHARGE');
  if (!res.ok) throw new Error('Could not load your other charges.');
  const body: LedgerResponse = await res.json();
  const chargeRows = body.entries
    .filter((e) => e.type === 'OTHER_CHARGE')
    .map((e) => ({
      id: e.id,
      feeTypeName: e.feeTypeName,
      date: e.date,
      amount: e.amount,
      settledAmount: e.settledAmount ?? 0,
      settlementStatus: e.settlementStatus ?? 'UNPAID',
    }));
  const depositRows = body.entries
    .filter((e) => e.type === 'DEPOSIT')
    .map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      status: (e.status ?? 'PENDING') as ApprovalStatus,
      hasReceipt: e.hasReceipt ?? false,
    }));
  return {
    chargeRows,
    depositRows,
    totalOtherChargesAmount: body.totals.totalCharges,
    outstanding: body.totals.outstanding,
  };
}

const SETTLEMENT_META: Record<SettlementStatus, { className: string; label: string }> = {
  PAID: { className: 'bg-teal-light text-teal', label: 'Paid' },
  PARTIALLY_SETTLED: { className: 'bg-amber-light text-brass', label: 'Partially settled' },
  UNPAID: { className: 'bg-coral-light text-coral', label: 'Unpaid' },
};

function SettlementBadge({ row }: { row: OtherChargeRow }) {
  const meta = SETTLEMENT_META[row.settlementStatus];
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

const depositColumns: ColumnDef<DepositRow, unknown>[] = [
  {
    id: 'date',
    header: 'Date',
    cell: ({ row }) => <span className="font-mono-brand text-ink">{dateLabel(row.original.date)}</span>,
  },
  {
    id: 'amount',
    header: 'Amount',
    meta: { align: 'right' },
    cell: ({ row }) => (
      <span className="font-mono-brand text-teal">+₹{row.original.amount.toLocaleString('en-IN')}</span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    meta: { align: 'right' },
    cell: ({ row }) => <ApprovalBadge status={row.original.status} />,
  },
  {
    id: 'receipt',
    header: '',
    cell: ({ row }) =>
      row.original.status === 'APPROVED' && row.original.hasReceipt ? (
        <ReceiptDownloadButton entryId={row.original.id} />
      ) : null,
  },
];

type BookTab = 'BILLS' | 'PAYMENTS';

const BOOK_TABS: { value: BookTab; label: string }[] = [
  { value: 'PAYMENTS', label: 'Payment History' },
  { value: 'BILLS', label: 'Bills' },
];

// OTHER_CHARGE-and-Deposit-history view — the exact structural mirror of
// MaintenanceBookPage.tsx for the Other Charges pool (docs/other-charges/): the same
// two summary cards, the same "Payment History" (default)/"Bills" tabs, the same Pay
// control, the same sortable/date-filterable charges table with a derived
// settlement-status badge, and the same Payment History table with receipt
// downloads. Reached only via the Dashboard's "Other Outstanding" card, not a
// sidebar item.
export function OtherChargesBookPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [amountInput, setAmountInput] = useState('');
  const [activeTab, setActiveTab] = useState<BookTab>('PAYMENTS');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-other-charges'],
    queryFn: fetchOtherChargesBook,
  });
  // Shared with MaintenanceBookPage.tsx — there's only ever one intent, across both
  // pools (docs/other-charges/).
  const intentQuery = useQuery({ queryKey: ['payment-intent'], queryFn: fetchOpenIntent });
  const intentOpenForThisPool = intentQuery.data?.category === 'OTHER_CHARGE';
  const intentOpenForOtherPool = !!intentQuery.data && intentQuery.data.category !== 'OTHER_CHARGE';

  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (data) setAmountInput(String(data.outstanding));
  }, [data]);

  const outstanding = data?.outstanding ?? 0;
  const parsedAmount = Number(amountInput);
  const isAmountValid =
    amountInput.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= outstanding;

  const lockMutation = useMutation<{ intent: unknown }, Error, number>({
    mutationFn: async (amount: number) => {
      const res = await authedFetch('/api/me/ledger/deposits/intent', {
        method: 'POST',
        body: JSON.stringify({ amount, category: 'OTHER_CHARGE' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not lock this payment.');
      return body;
    },
    onSuccess: (body) => {
      queryClient.setQueryData(['payment-intent'], (body as { intent: { upiLink?: string } }).intent);
      const intent = (body as { intent: { upiLink?: string } }).intent;
      if (isMobile && intent.upiLink) window.location.href = intent.upiLink;
    },
  });

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
    const filtered = data.chargeRows.filter((r) => {
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

  const columns = useMemo<ColumnDef<OtherChargeRow, unknown>[]>(
    () => [
      {
        id: 'feeType',
        header: 'Fee type',
        cell: ({ row }) => <span className="text-ink">{row.original.feeTypeName ?? '—'}</span>,
      },
      {
        id: 'date',
        header: () => <SortableHeader label="Billed on" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={handleSort} />,
        cell: ({ row }) => <span className="font-mono-brand text-ink">{dateLabel(row.original.date)}</span>,
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
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Other charges</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your other charges.
        </p>
      )}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4">
            <SummaryCard label="Total other charges amount" value={data.totalOtherChargesAmount} />
            <SummaryCard
              label="Other Outstanding"
              value={outstanding}
              accent={outstanding > 0 ? 'coral' : undefined}
            />
          </div>

          <div className="mb-4 flex gap-2" role="tablist">
            {BOOK_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  activeTab === tab.value ? 'bg-teal text-white' : 'border border-line text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'BILLS' && (
            <>
              <div className="mb-5 rounded-2xl border border-line bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                  <div>
                    {outstanding > 0 ? (
                      <span className="text-sm text-ink">
                        You owe <strong className="font-mono-brand">₹{outstanding.toLocaleString('en-IN')}</strong>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-teal">
                        <CheckCircle2 size={16} /> Nothing outstanding right now
                      </span>
                    )}
                  </div>
                  {outstanding > 0 && !intentQuery.data && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col text-xs font-semibold text-muted">
                        Amount to pay
                        <input
                          type="number"
                          aria-label="Amount to pay"
                          value={amountInput}
                          onChange={(e) => setAmountInput(e.target.value)}
                          min={0.01}
                          max={outstanding}
                          step="0.01"
                          className="mt-1 w-32 rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => lockMutation.mutate(parsedAmount)}
                        disabled={lockMutation.isPending || !isAmountValid}
                        className="flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
                      >
                        <QrCode size={14} /> {lockMutation.isPending ? 'Locking…' : 'Pay'}
                      </button>
                    </div>
                  )}
                </div>

                {outstanding > 0 && !intentQuery.data && !isAmountValid && amountInput.trim() !== '' && (
                  <p className="mb-2.5 mt-[-0.5rem] text-xs text-coral">
                    Enter an amount between ₹1 and ₹{outstanding.toLocaleString('en-IN')}.
                  </p>
                )}

                {lockMutation.error && <ErrorBanner>{lockMutation.error.message}</ErrorBanner>}

                {intentOpenForThisPool && intentQuery.data && (
                  <PayIntentPanel
                    intent={intentQuery.data}
                    isMobile={isMobile}
                    onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['my-other-charges'] })}
                  />
                )}
                {/* docs/other-charges/ — at most one open intent at a time, across both
                    pools. If it's for Maintenance, this page can't start a new one
                    (server-blocked) — point at where to finish it instead. */}
                {intentOpenForOtherPool && (
                  <div className="mb-4 rounded-xl border border-line bg-paper p-4 text-sm text-ink">
                    You have a pending payment for Maintenance — finish or cancel it on the{' '}
                    <Link to="/maintenance-book" className="font-semibold text-teal">
                      Maintenance Book
                    </Link>{' '}
                    page before paying here.
                  </div>
                )}
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

              <DataTable data={rows} columns={columns} getRowId={(r) => r.id} emptyMessage="No charges billed yet." />
            </>
          )}

          {activeTab === 'PAYMENTS' &&
            (data.depositRows.length === 0 ? (
              <p className="m-0 flex items-center gap-1.5 text-sm text-teal">
                <Check size={14} /> No payments yet
              </p>
            ) : (
              <DataTable
                data={data.depositRows}
                columns={depositColumns}
                getRowId={(r) => r.id}
                emptyMessage="No payments yet."
              />
            ))}
        </>
      )}
    </div>
  );
}
