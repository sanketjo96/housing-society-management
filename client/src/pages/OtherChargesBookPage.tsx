import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, CheckCircle2, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { ErrorBanner } from '../components/FormField';
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

interface LedgerResponse {
  entries: {
    id: string;
    type: string;
    feeTypeName?: string;
    date: string;
    amount: number;
    settledAmount?: number;
    settlementStatus?: SettlementStatus;
  }[];
  totals: { outstanding: number };
}

// Mirrors MaintenanceBookPage.tsx's shape for the Other Charges pool — its own
// Outstanding, its own record list, its own Pay flow (docs/other-charges/). Reuses
// GET /api/me/ledger with category=OTHER_CHARGE (no separate backend endpoint,
// same "the data is already there" reasoning as Maintenance Book).
async function fetchOtherChargesBook(): Promise<{ rows: OtherChargeRow[]; outstanding: number }> {
  const res = await authedFetch('/api/me/ledger?category=OTHER_CHARGE');
  if (!res.ok) throw new Error('Could not load your other charges.');
  const body: LedgerResponse = await res.json();
  const rows = body.entries
    .filter((e) => e.type === 'OTHER_CHARGE')
    .map((e) => ({
      id: e.id,
      feeTypeName: e.feeTypeName,
      date: e.date,
      amount: e.amount,
      settledAmount: e.settledAmount ?? 0,
      settlementStatus: e.settlementStatus ?? 'UNPAID',
    }));
  return { rows, outstanding: body.totals.outstanding };
}

const STATUS_META: Record<SettlementStatus, { className: string; label: string }> = {
  PAID: { className: 'bg-teal-light text-teal', label: 'Paid' },
  PARTIALLY_SETTLED: { className: 'bg-amber-light text-brass', label: 'Partially settled' },
  UNPAID: { className: 'bg-coral-light text-coral', label: 'Unpaid' },
};

function SettlementBadge({ row }: { row: OtherChargeRow }) {
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

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const columns: ColumnDef<OtherChargeRow, unknown>[] = [
  {
    id: 'feeType',
    header: 'Fee type',
    cell: ({ row }) => <span className="text-ink">{row.original.feeTypeName ?? '—'}</span>,
  },
  {
    id: 'date',
    header: 'Billed on',
    cell: ({ row }) => <span className="font-mono-brand text-ink">{dateLabel(row.original.date)}</span>,
  },
  {
    id: 'amount',
    header: 'Amount',
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
];

export function OtherChargesBookPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [amountInput, setAmountInput] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-other-charges'],
    queryFn: fetchOtherChargesBook,
  });
  // Shared with ResidentDashboardOverview.tsx — there's only ever one intent,
  // across both pools (docs/other-charges/).
  const intentQuery = useQuery({ queryKey: ['payment-intent'], queryFn: fetchOpenIntent });
  const intentOpenForThisPool = intentQuery.data?.category === 'OTHER_CHARGE';
  const intentOpenForOtherPool = !!intentQuery.data && intentQuery.data.category !== 'OTHER_CHARGE';

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
          <div className="mb-5 rounded-2xl border border-ink bg-ink p-5">
            <p className="m-0 text-xs uppercase tracking-wide text-[#B7BCB2]">Other Outstanding</p>
            <p className="m-0 mt-1 font-mono-brand text-2xl font-semibold text-white">
              ₹{outstanding.toLocaleString('en-IN')}
            </p>
          </div>

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
                <Link to="/dashboard" className="font-semibold text-teal">
                  Dashboard
                </Link>{' '}
                page before paying here.
              </div>
            )}

            {data.rows.length === 0 && (
              <p className="m-0 flex items-center gap-1.5 text-sm text-teal">
                <Check size={14} /> No charges billed yet
              </p>
            )}
          </div>

          <DataTable
            data={data.rows}
            columns={columns}
            getRowId={(r) => r.id}
            emptyMessage="No charges billed yet."
          />
        </>
      )}
    </div>
  );
}
