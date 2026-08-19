import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, CheckCircle2, Download, PlusCircle, QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../components/FormField';
import { FileUploadField } from '../components/FileUploadField';
import { Modal } from '../components/Modal';
import { fetchOpenIntent, PayIntentPanel, type PaymentIntent } from '../components/PayIntentPanel';
import { authedFetch } from '../lib/api';
import { useIsMobile } from '../lib/use-is-mobile';

type LedgerStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
type LedgerEntryType = 'DEPOSIT' | 'CREDIT';

interface LedgerRow {
  id: string;
  type: 'SYSTEM' | LedgerEntryType;
  period?: string;
  date: string;
  payer: string;
  amount: number;
  status: LedgerStatus;
  note?: string | null;
  // Only meaningful on DEPOSIT/CREDIT rows — true once a Receipt exists for this
  // entry (Receipt Generation & Approval Workflow, 2026-08-11). A still-pending row
  // or a legacy entry approved before this feature shipped has no receipt to show.
  hasReceipt?: boolean;
}

interface LedgerTotals {
  totalCharges: number;
  approvedDeposits: number;
  approvedCredits: number;
  outstanding: number;
  availableCredit: number;
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

// docs/other-charges/ — powers the "Other Outstanding"/"Total Outstanding" cards in
// one cheap call, independent of (and never merged with) the maintenance ledger
// fetch above.
interface BalancesSummary {
  maintenance: { outstanding: number };
  otherCharges: { outstanding: number };
  totalOutstanding: number;
}

async function fetchMyLedger(year: number): Promise<LedgerResponse> {
  const res = await authedFetch(`/api/me/ledger?year=${year}`);
  if (!res.ok) throw new Error('Could not load your dashboard.');
  return res.json();
}

async function fetchMyBalances(): Promise<BalancesSummary> {
  const res = await authedFetch('/api/me/balances');
  if (!res.ok) throw new Error('Could not load your balances.');
  return res.json();
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

// Credit re-introduced 2026-08-07 — there's something to distinguish in this table
// again (a Deposit is a UPI payment; a Credit is a committee-approved adjustment),
// so the Type column returns after the 2026-08-07 Credit-removal pivot had dropped it
// for having nothing left to show.
const TYPE_META: Record<LedgerEntryType, { className: string; label: string }> = {
  DEPOSIT: { className: 'border border-line text-ink', label: 'Deposit' },
  CREDIT: { className: 'border border-brass text-brass', label: 'Credit' },
};

function TypeBadge({ type }: { type: LedgerEntryType }) {
  const meta = TYPE_META[type];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

// The issued-receipt endpoint is authenticated (never a public URL), so a plain
// <a href> won't carry the Bearer token — fetch it ourselves and hand the browser
// a blob: URL instead, same pattern the admin Payment Proofs queue uses for both
// proof files and receipts.
async function downloadReceipt(entryId: string) {
  const res = await authedFetch(`/api/ledger-entries/${entryId}/receipt`);
  if (!res.ok) throw new Error('Could not load your receipt.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Own its own error state — same reasoning as PaymentProofsPage.tsx's per-cell
// components (doesn't fit TanStack Table's per-cell rendering model otherwise).
function ReceiptDownloadButton({ entryId }: { entryId: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          downloadReceipt(entryId).catch((e: Error) => setError(e.message));
        }}
        className="flex items-center gap-1 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Download size={12} /> Receipt
      </button>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </>
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

// A committee-approved adjustment against the flat's balance (e.g. a repair cost the
// owner wants settled against maintenance) — resident-submitted like a Deposit, but
// amount isn't capped at Outstanding (createCredit's own validation is just
// `amount > 0`) and both a reason note *and* a proof attachment (receipt/invoice/
// photo) are required — unlike a Deposit's optional screenshot, an arbitrary
// discretionary adjustment needs independent evidence for the committee to evaluate
// it, not just a self-reported amount. Starts PENDING and has zero effect on any
// balance until an admin approves it — the pending row still shows up in the table
// below with a Pending badge and its note, satisfying the spec's "₹X credit pending
// approval" visibility without a separate dedicated banner.
function AddCreditModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const parsedAmount = Number(amount);
  const isAmountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isNoteValid = note.trim() !== '';

  const submitMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('amount', amount);
      formData.append('note', note.trim());
      if (file) formData.append('file', file);
      const res = await authedFetch('/api/me/ledger/credits', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit your credit request.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ledger'] });
      onClose();
    },
  });

  return (
    <Modal title="Add credit" subtitle="Request a committee-approved adjustment against your dues." onClose={onClose}>
      <Field label="Amount">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={0.01}
          step="0.01"
          className={inputClass}
        />
      </Field>
      <Field label="Reason">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. Plumber repair for the common water tank"
          className={inputClass}
        />
        {!isNoteValid && note.length > 0 && <ErrMsg>A reason is required.</ErrMsg>}
      </Field>
      <div className="mb-3.5">
        <span className="mb-1.5 block text-xs font-semibold text-muted">Proof</span>
        <FileUploadField file={file} onFileChange={setFile} required placeholder="Attach receipt, invoice, or photo" />
      </div>

      {submitMutation.error && <ErrorBanner>{submitMutation.error.message}</ErrorBanner>}

      <button
        type="button"
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || !isAmountValid || !isNoteValid || !file}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        {submitMutation.isPending ? 'Submitting…' : 'Submit for approval'}
      </button>
    </Modal>
  );
}

export function ResidentDashboardOverview() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [year, onYearChange] = useState(() => new Date().getFullYear());
  // Pre-filled to the full Outstanding (so a single tap still pays it off, unchanged
  // default behavior) but freely editable down to any amount — rule 6: "a resident
  // may pay any amount from ₹1 up to the current Outstanding," explicit partial
  // payment is allowed, not just an all-or-nothing lock. Kept as a string so the
  // field can be transiently empty/invalid while typing without fighting the input.
  const [amountInput, setAmountInput] = useState('');
  const [showCreditModal, setShowCreditModal] = useState(false);

  const { data, isLoading, isError } = useQuery({ queryKey: ['my-ledger', year], queryFn: () => fetchMyLedger(year) });
  // docs/other-charges/ — a fully separate pool, its own cheap summary call, never
  // merged into `data.totals` above.
  const { data: balances } = useQuery({ queryKey: ['my-balances'], queryFn: fetchMyBalances });
  // The Pay button's own visibility/state, and PayIntentPanel's rendering, both key
  // off this — an open intent means the panel is already showing, no separate
  // "tap Pay again" step needed on a return visit (spec: "the pending intent
  // persists and is shown again next time they open the app"). Shared with
  // OtherChargesBookPage.tsx — there's only ever one intent, across both pools
  // (docs/other-charges/), so both pages observe the same query/cache entry.
  const intentQuery = useQuery({ queryKey: ['payment-intent'], queryFn: fetchOpenIntent });
  // An intent open for the OTHER pool blocks starting one here (server-enforced —
  // see IntentAlreadyOpenForOtherCategoryError) — this page must render a notice
  // instead of the Pay button/form in that case, not attempt to lock anyway.
  const intentOpenForThisPool = intentQuery.data?.category === 'MAINTENANCE';
  const intentOpenForOtherPool = !!intentQuery.data && intentQuery.data.category !== 'MAINTENANCE';

  // Re-defaults the field to the current Outstanding whenever it changes (e.g. after
  // a prior payment is approved and the resident opens Pay again) — but not on every
  // render, so it doesn't clobber whatever the resident is actively typing.
  useEffect(() => {
    if (data) setAmountInput(String(data.totals.outstanding));
  }, [data]);

  const parsedAmount = Number(amountInput);
  const outstanding = data?.totals.outstanding ?? 0;
  const isAmountValid = amountInput.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= outstanding;

  // Locks whichever amount the resident has entered — re-validated server-side as
  // `0 < amount <= outstanding` regardless of what the client sends (never trust the
  // client's cap). No year involved (Outstanding isn't a per-year concept — see the
  // LedgerResponse comment above). Nothing is editable once locked (the amount shown
  // in PayIntentPanel is read-only) — only the entry step, before locking, allows a
  // different amount.
  const lockMutation = useMutation<{ intent: PaymentIntent }, Error, number>({
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
      queryClient.setQueryData(['payment-intent'], body.intent);
      // Only a UPI intent has an app to deep-link into — a bank-transfer intent has
      // no equivalent redirect, the account details just render in PayIntentPanel.
      if (isMobile && body.intent.upiLink) window.location.href = body.intent.upiLink;
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
    () => (data ? data.entries.filter((e): e is LedgerRow & { type: LedgerEntryType } => e.type !== 'SYSTEM') : []),
    [data],
  );

  const columns = useMemo<ColumnDef<LedgerRow & { type: LedgerEntryType }, unknown>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <span>
            <span className="font-mono-brand text-ink">{dateLabel(row.original.date)}</span>
            {row.original.type === 'DEPOSIT' && row.original.status === 'APPROVED' && (
              <div className="mt-0.5 text-xs text-muted">UPI payment approved</div>
            )}
            {row.original.type === 'CREDIT' && row.original.note && (
              <div className="mt-0.5 text-xs text-muted">{row.original.note}</div>
            )}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => <TypeBadge type={row.original.type} />,
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
          <div className="mb-5 grid grid-cols-2 gap-4">
            <SummaryCard label="Maintenance Outstanding" value={data.totals.outstanding} />
            <SummaryCard label="Available Credit" value={data.totals.availableCredit} />
            <Link to="/other-charges-book" className="block">
              <SummaryCard label="Other Outstanding" value={balances?.otherCharges.outstanding ?? 0} />
            </Link>
            <SummaryCard label="Total Outstanding" value={balances?.totalOutstanding ?? 0} />
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
              <div className="flex flex-wrap items-end gap-2">
                {data.totals.outstanding > 0 && !intentQuery.data && (
                  <>
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
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowCreditModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-brass px-4 py-2 text-sm font-semibold text-brass"
                >
                  <PlusCircle size={14} /> Add credit
                </button>
              </div>
            </div>

            {data.totals.outstanding > 0 && !intentQuery.data && !isAmountValid && amountInput.trim() !== '' && (
              <p className="mb-2.5 mt-[-0.5rem] text-xs text-coral">
                Enter an amount between ₹1 and ₹{outstanding.toLocaleString('en-IN')}.
              </p>
            )}

            {lockMutation.error && <ErrorBanner>{lockMutation.error.message}</ErrorBanner>}

            {/* Shown either right after locking, or because a payment locked
                earlier (this session or a past one) is still open and awaiting a
                screenshot. */}
            {intentOpenForThisPool && intentQuery.data && (
              <PayIntentPanel
                intent={intentQuery.data}
                isMobile={isMobile}
                onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['my-ledger'] })}
              />
            )}
            {/* docs/other-charges/ — a resident has at most one open intent at a
                time, across both pools. If it's for Other Charges, this page can't
                start a new one (server-blocked) — point them at where to finish it
                instead of just hiding the Pay button with no explanation. */}
            {intentOpenForOtherPool && (
              <div className="mb-4 rounded-xl border border-line bg-paper p-4 text-sm text-ink">
                You have a pending payment for Other Charges — finish or cancel it on the{' '}
                <Link to="/other-charges-book" className="font-semibold text-teal">
                  Other Charges
                </Link>{' '}
                page before paying here.
              </div>
            )}

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

      {showCreditModal && <AddCreditModal onClose={() => setShowCreditModal(false)} />}
    </div>
  );
}
