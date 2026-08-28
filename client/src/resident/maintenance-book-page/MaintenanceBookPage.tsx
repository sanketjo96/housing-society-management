import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, CheckCircle2, QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/data-table/DataTable';
import { ErrorBanner } from '../../components/form-field/FormField';
import {
  ApprovalBadge,
  type ApprovalStatus,
  dateLabel,
  DepositNoteCell,
  ReceiptDownloadButton,
  SummaryCard,
} from '../_shared/components/ledger-entry-display/LedgerEntryDisplay';
import { fetchOpenIntent } from '../_shared/components/pay-intent-panel/PayIntentPanel';
import { PayModal } from '../_shared/components/pay-modal/PayModal';
import { authedFetch } from '../../lib/api';
import { useIsMobile } from '../../lib/use-is-mobile';
import type {
  BookTab,
  DepositRow,
  LedgerResponse,
  MaintenanceBookData,
  MaintenanceRow,
  SettlementStatus,
  SortDir,
  SortKey,
} from './types';

// Fetches the full lifetime ledger and filters client-side into SYSTEM charges
// and DEPOSIT history — no dedicated backend endpoints needed.
async function fetchMaintenanceBook(): Promise<MaintenanceBookData> {
  const res = await authedFetch('/api/me/ledger');
  if (!res.ok) throw new Error('Could not load your maintenance book.');
  const body: LedgerResponse = await res.json();
  const chargeRows = body.entries
    .filter((e) => e.type === 'SYSTEM')
    .map((e) => ({
      id: e.id,
      period: e.period ?? '',
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
      note: e.note,
      adminNote: e.adminNote,
    }));
  return {
    chargeRows,
    depositRows,
    outstanding: body.totals.outstanding,
  };
}

const SETTLEMENT_META: Record<SettlementStatus, { className: string; label: string }> = {
  PAID: { className: 'bg-teal-light text-teal', label: 'Paid' },
  PARTIALLY_SETTLED: { className: 'bg-amber-light text-brass', label: 'Partially settled' },
  UNPAID: { className: 'bg-coral-light text-coral', label: 'Unpaid' },
};

function SettlementBadge({ row }: { row: MaintenanceRow }) {
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

function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  // The button is a flex container, which — unlike plain text — doesn't
  // honor the header cell's `text-align: right` (DataTable.tsx's `meta.align`)
  // on its own; it needs to fill the cell and justify its own content to
  // line up with right-aligned numeric values below it.
  align?: 'right';
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 bg-transparent p-0 font-semibold ${align === 'right' ? 'w-full justify-end' : ''} ${active ? 'text-ink' : 'text-muted'}`}
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
    id: 'note',
    header: 'Note',
    cell: ({ row }) => (
      <DepositNoteCell note={row.original.note} adminNote={row.original.adminNote} status={row.original.status} />
    ),
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

const BOOK_TABS: { value: BookTab; label: string }[] = [
  { value: 'PAYMENTS', label: 'Payment History' },
  { value: 'BILLS', label: 'Charges' },
];

// Two tabs: "Payment History" (default — Pay control + Deposit history) and
// "Charges" (charges table + date filters, no Pay control). Status on the
// Charges table is a derived Unpaid/Partially settled/Paid badge (FIFO-filled
// server-side across records oldest-first). Lifetime view — only the Charges
// tab's date filter narrows it.
export function MaintenanceBookPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [amountInput, setAmountInput] = useState('');
  const [activeTab, setActiveTab] = useState<BookTab>('PAYMENTS');
  // Step 1 (PayModal, before locking) decides what's being paid; Step 2
  // (PayIntentPanel, after locking) only reads it back to show the
  // committee-approval warning for 'EXPENSE' — the note field itself is
  // always available regardless of which is picked.
  const [paymentType, setPaymentType] = useState<'MAINTENANCE' | 'EXPENSE'>('MAINTENANCE');
  const [payModalOpen, setPayModalOpen] = useState(false);
  // "Back" (Step 2 -> Step 1) without cancelling the already-locked intent —
  // re-locking upserts the same intent server-side, so this is purely a
  // local display override on top of `intentOpenForThisPool`.
  const [showStep1, setShowStep1] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-maintenance-records'],
    queryFn: fetchMaintenanceBook,
  });
  // There's only ever one open intent, across both pools.
  const intentQuery = useQuery({ queryKey: ['payment-intent'], queryFn: fetchOpenIntent });
  const intentOpenForThisPool = intentQuery.data?.category === 'MAINTENANCE';
  const intentOpenForOtherPool = !!intentQuery.data && intentQuery.data.category !== 'MAINTENANCE';

  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Pre-fills the full Outstanding; left blank at ₹0 so the "greater than ₹0"
  // error doesn't flash immediately and the field is free for an advance amount.
  useEffect(() => {
    if (data) setAmountInput(data.outstanding > 0 ? String(data.outstanding) : '');
  }, [data]);

  const outstanding = data?.outstanding ?? 0;
  const parsedAmount = Number(amountInput);
  // Amount beyond Outstanding settles it in full; the remainder becomes Available Credit.
  const isAmountValid = amountInput.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const overpayAmount = isAmountValid && parsedAmount > outstanding ? parsedAmount - outstanding : 0;

  const lockMutation = useMutation<{ intent: unknown }, Error, number>({
    mutationFn: async (amount: number) => {
      const res = await authedFetch('/api/me/ledger/deposits/intent', {
        method: 'POST',
        body: JSON.stringify({ amount, category: 'MAINTENANCE' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not lock this payment.');
      return body;
    },
    onSuccess: (body) => {
      queryClient.setQueryData(['payment-intent'], (body as { intent: { upiLink?: string } }).intent);
      const intent = (body as { intent: { upiLink?: string } }).intent;
      setShowStep1(false);
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

  const columns = useMemo<ColumnDef<MaintenanceRow, unknown>[]>(
    () => [
      {
        id: 'date',
        header: () => (
          <SortableHeader label="Billed on" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
        ),
        cell: ({ row }) => <span className="font-mono-brand text-ink">{periodLabel(row.original.period)}</span>,
      },
      {
        id: 'amount',
        header: () => (
          <SortableHeader
            label="Amount"
            sortKey="amount"
            activeKey={sortKey}
            dir={sortDir}
            onSort={handleSort}
            align="right"
          />
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
          <div className="mb-5">
            <SummaryCard
              label="Maintenance Outstanding"
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

              <DataTable
                data={rows}
                columns={columns}
                getRowId={(r) => r.id}
                emptyMessage="No maintenance records yet."
              />
            </>
          )}

          {activeTab === 'PAYMENTS' && (
            <>
              <div className="mb-5 rounded-2xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
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
                  {/* Visible even at ₹0 Outstanding, for advance deposits. Hidden only when the open intent belongs to the other pool. */}
                  {!intentOpenForOtherPool && (
                    <button
                      type="button"
                      onClick={() => setPayModalOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
                    >
                      <QrCode size={14} /> {intentOpenForThisPool ? 'Resume payment' : 'Pay'}
                    </button>
                  )}
                </div>

                {/* Only one open intent at a time — point at where to finish an Other Charges one. */}
                {intentOpenForOtherPool && (
                  <div className="mt-4 rounded-xl border border-line bg-paper p-4 text-sm text-ink">
                    You have a pending payment for Other Charges — finish or cancel it on the{' '}
                    <Link to="/other-charges-book" className="font-semibold text-teal">
                      Other Charges
                    </Link>{' '}
                    page before paying here.
                  </div>
                )}
              </div>

              <PayModal
                title="Maintenance payment"
                isOpen={payModalOpen}
                onClose={() => {
                  setPayModalOpen(false);
                  setShowStep1(false);
                }}
                intent={intentOpenForThisPool && !showStep1 ? intentQuery.data : null}
                isMobile={isMobile}
                paymentType={paymentType}
                multiStep
                onBack={() => setShowStep1(true)}
                onSubmitted={() => {
                  queryClient.invalidateQueries({ queryKey: ['my-maintenance-records'] });
                  setPaymentType('MAINTENANCE');
                  setShowStep1(false);
                }}
                onCancelled={() => setPaymentType('MAINTENANCE')}
                step1={
                  <div>
                    <div className="mb-3 flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <input
                          type="radio"
                          name="pay-intent-payment-type"
                          value="MAINTENANCE"
                          checked={paymentType === 'MAINTENANCE'}
                          onChange={() => setPaymentType('MAINTENANCE')}
                        />
                        Maintenance Payment
                      </label>
                      <label className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <input
                          type="radio"
                          name="pay-intent-payment-type"
                          value="EXPENSE"
                          checked={paymentType === 'EXPENSE'}
                          onChange={() => setPaymentType('EXPENSE')}
                        />
                        Expense to settle against maintenance
                      </label>
                    </div>

                    <label className="mb-3 flex flex-col text-xs font-semibold text-muted">
                      {outstanding > 0 ? 'Amount to pay' : 'Amount to deposit'}
                      <input
                        type="number"
                        aria-label="Amount to pay"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        min={0.01}
                        step="0.01"
                        className="mt-1 w-full rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                      />
                    </label>

                    {!isAmountValid && amountInput.trim() !== '' && (
                      <p className="mb-2.5 text-xs text-coral">Enter an amount greater than ₹0.</p>
                    )}
                    {overpayAmount > 0 && (
                      <p className="mb-2.5 text-xs text-teal">
                        ₹{overpayAmount.toLocaleString('en-IN')} will be applied as Available Credit.
                      </p>
                    )}
                    {lockMutation.error && <ErrorBanner>{lockMutation.error.message}</ErrorBanner>}

                    <button
                      type="button"
                      onClick={() => lockMutation.mutate(parsedAmount)}
                      disabled={lockMutation.isPending || !isAmountValid}
                      className="flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
                    >
                      {lockMutation.isPending ? 'Locking…' : 'Next'}
                    </button>
                  </div>
                }
              />

              {data.depositRows.length === 0 ? (
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
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
