import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, CheckCircle2, QrCode, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { ErrorBanner } from '../components/FormField';
import { FileUploadField } from '../components/FileUploadField';
import { authedFetch } from '../lib/api';
import { useIsMobile } from '../lib/use-is-mobile';

type LedgerStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

interface LedgerRow {
  id: string;
  type: 'SYSTEM' | 'DEPOSIT';
  period?: string;
  date: string;
  payer: string;
  amount: number;
  status: LedgerStatus;
  note?: string | null;
}

interface LedgerTotals {
  totalCharges: number;
  approvedDeposits: number;
  outstanding: number;
}

interface LedgerResponse {
  entries: LedgerRow[];
  // Always lifetime — Outstanding never changes with the selected year (see
  // ledger.service.ts's getLedgerForResident comment).
  totals: LedgerTotals;
  // Scoped to the requested year — used only for "sum over this year" figures like
  // the Total Paid row below.
  yearTotals: LedgerTotals;
  availableYears: number[];
}

interface PaymentIntent {
  id: string;
  amount: number;
  upiLink: string;
  qrDataUrl: string;
  createdAt: string;
}

async function fetchMyLedger(year: number): Promise<LedgerResponse> {
  const res = await authedFetch(`/api/me/ledger?year=${year}`);
  if (!res.ok) throw new Error('Could not load your dashboard.');
  return res.json();
}

async function fetchOpenIntent(): Promise<PaymentIntent | null> {
  const res = await authedFetch('/api/me/ledger/deposits/intent');
  if (!res.ok) throw new Error('Could not check your pending payment.');
  const body = await res.json();
  return body.intent;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_META: Record<LedgerStatus, { className: string; label: string }> = {
  APPROVED: { className: 'bg-teal-light text-teal', label: 'Approved' },
  PENDING: { className: 'bg-amber-light text-brass', label: 'Pending' },
  REJECTED: { className: 'bg-coral-light text-coral', label: 'Rejected' },
};

function ApprovalBadge({ status }: { status: LedgerStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-ink bg-ink p-5">
      <p className="m-0 text-xs uppercase tracking-wide text-[#B7BCB2]">{label}</p>
      <p className="m-0 mt-1 font-mono-brand text-2xl font-semibold text-white">₹{value.toLocaleString('en-IN')}</p>
    </div>
  );
}

// Pay — tapping the header's Pay button locks the amount immediately, at exactly
// the current Outstanding (see ResidentDashboardOverview's lockMutation) — there is
// no amount-entry step and the amount can't be edited once locked. This panel only
// ever renders once an intent already exists — forking by device from that point
// on: mobile deep-links straight into a UPI app and then prompts for the screenshot
// on return; desktop shows a QR to scan with a phone and lets the resident attach
// the screenshot whenever they're back, even in a later session (the intent is a
// real DB row, not just component state — see ledger.service.ts's PaymentIntent
// functions).
function PayIntentPanel({ intent, isMobile }: { intent: PaymentIntent; isMobile: boolean }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  // Re-check the open intent when the resident comes back to the tab (e.g. after
  // the UPI app redirect on mobile) — the intent is server-persisted, so this just
  // keeps the UI in sync rather than relying on the 30s query staleTime.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [queryClient]);

  const submitMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const formData = new FormData();
      if (file) formData.append('file', file);
      const res = await authedFetch('/api/me/ledger/deposits/intent/submit', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit your payment.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
      setFile(null);
    },
  });

  const cancelMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      await authedFetch('/api/me/ledger/deposits/intent', { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
    },
  });

  return (
    <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-line bg-paper p-4">
      {!isMobile && (
        <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-md border border-line bg-white p-1">
          <img src={intent.qrDataUrl} alt="UPI payment QR code" className="h-full w-full" />
        </div>
      )}
      <div className="min-w-52 flex-1">
        <p className="m-0 mb-1.5 text-sm font-semibold text-ink">
          ₹{intent.amount.toLocaleString('en-IN')} locked{' '}
          <span className="font-normal text-muted">— awaiting your screenshot</span>
        </p>
        <p className="m-0 mb-2.5 text-xs text-muted">
          {isMobile
            ? 'Complete the payment in your UPI app, then attach the screenshot below.'
            : 'Scan the QR with a UPI app on your phone. Once you have a screenshot, attach it below — you can come back later if needed.'}
        </p>

        <div className="mb-2.5">
          <FileUploadField file={file} onFileChange={setFile} required placeholder="Attach payment screenshot" />
        </div>

        {submitMutation.error && <ErrorBanner>{submitMutation.error.message}</ErrorBanner>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !file}
            className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
          >
            {submitMutation.isPending ? 'Submitting…' : 'Submit payment'}
          </button>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-transparent px-3.5 py-2 text-xs font-semibold text-ink"
          >
            <X size={13} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResidentDashboardOverview() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [year, onYearChange] = useState(() => new Date().getFullYear());

  const { data, isLoading, isError } = useQuery({ queryKey: ['my-ledger', year], queryFn: () => fetchMyLedger(year) });
  // The Pay button's own visibility/state, and PayIntentPanel's rendering, both key
  // off this — an open intent means the panel is already showing, no separate
  // "tap Pay again" step needed on a return visit (spec: "the pending intent
  // persists and is shown again next time they open the app").
  const intentQuery = useQuery({ queryKey: ['payment-intent'], queryFn: fetchOpenIntent });

  // Locks the amount at exactly the current (lifetime) Outstanding — no amount
  // entry, nothing to edit once locked, no year involved (Outstanding isn't a
  // per-year concept — see the LedgerResponse comment above).
  const lockMutation = useMutation<{ intent: PaymentIntent }, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch('/api/me/ledger/deposits/intent', {
        method: 'POST',
        body: JSON.stringify({ amount: data?.totals.outstanding }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not lock this payment.');
      return body;
    },
    onSuccess: (body) => {
      queryClient.setQueryData(['payment-intent'], body.intent);
      if (isMobile) window.location.href = body.intent.upiLink;
    },
  });

  // If the current year has no data for this flat yet (e.g. a flat onboarded last
  // year), default to the most recent year that does, rather than showing an
  // all-zero Dashboard for a year with nothing in it.
  useEffect(() => {
    if (data && data.availableYears.length > 0 && !data.availableYears.includes(year)) {
      onYearChange(data.availableYears[0]);
    }
  }, [data, year, onYearChange]);

  const ledgerRows = useMemo(
    () => (data ? data.entries.filter((e): e is LedgerRow & { type: 'DEPOSIT' } => e.type !== 'SYSTEM') : []),
    [data],
  );

  const columns = useMemo<ColumnDef<LedgerRow & { type: 'DEPOSIT' }, unknown>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <span>
            <span className="font-mono-brand text-ink">{dateLabel(row.original.date)}</span>
            {row.original.status === 'APPROVED' && (
              <div className="mt-0.5 text-xs text-muted">UPI payment approved</div>
            )}
          </span>
        ),
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
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Dashboard</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your dashboard.
        </p>
      )}

      {data && (
        <>
          <div className="mb-5">
            <SummaryCard label="Outstanding" value={data.totals.outstanding} />
          </div>

          <div className="mb-5 rounded-2xl border border-line bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                {data.totals.outstanding > 0 ? (
                  <span className="text-sm text-ink">
                    You owe <strong className="font-mono-brand">₹{data.totals.outstanding.toLocaleString('en-IN')}</strong>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-teal">
                    <CheckCircle2 size={16} /> Nothing outstanding right now
                  </span>
                )}
              </div>
              {data.totals.outstanding > 0 && !intentQuery.data && (
                <button
                  type="button"
                  onClick={() => lockMutation.mutate()}
                  disabled={lockMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
                >
                  <QrCode size={14} />{' '}
                  {lockMutation.isPending ? 'Locking…' : `Pay ₹${data.totals.outstanding.toLocaleString('en-IN')}`}
                </button>
              )}
            </div>

            {lockMutation.error && <ErrorBanner>{lockMutation.error.message}</ErrorBanner>}

            {/* Shown either right after locking, or because a payment locked
                earlier (this session or a past one) is still open and awaiting a
                screenshot. */}
            {intentQuery.data && <PayIntentPanel intent={intentQuery.data} isMobile={isMobile} />}

            {ledgerRows.length === 0 && (
              <p className="m-0 flex items-center gap-1.5 text-sm text-teal">
                <Check size={14} /> No entries yet
              </p>
            )}
          </div>

          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <p className="m-0 text-xs text-muted">
              Only approved entries count toward your Outstanding above.
              <br />
              The year below scopes this table only.
            </p>
            {data.availableYears.length > 0 && (
              <select
                aria-label="Year"
                value={year}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink"
              >
                {data.availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
          </div>

          <DataTable data={ledgerRows} columns={columns} getRowId={(r) => r.id} emptyMessage="No entries yet." />

          <div className="mt-2 flex items-center justify-between rounded-xl border border-line bg-paper px-4 py-3 text-sm">
            <span className="font-semibold text-ink">Total Paid ({year})</span>
            <span className="font-mono-brand font-semibold text-ink">
              ₹{data.yearTotals.approvedDeposits.toLocaleString('en-IN')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
