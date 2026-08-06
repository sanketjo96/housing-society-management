import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, CheckCircle2, QrCode, Upload, Wallet } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { ErrorBanner, Field, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { authedFetch } from '../lib/api';

type LedgerType = 'SYSTEM' | 'DEPOSIT' | 'CREDIT';
type LedgerStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

interface LedgerRow {
  id: string;
  type: LedgerType;
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
  approvedCredits: number;
  outstanding: number;
  creditBalance: number;
  payable: number;
}

interface LedgerResponse {
  entries: LedgerRow[];
  totals: LedgerTotals;
}

async function fetchMyLedger(): Promise<LedgerResponse> {
  const res = await authedFetch('/api/me/ledger');
  if (!res.ok) throw new Error('Could not load your passbook.');
  return res.json();
}

function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TYPE_META: Record<LedgerType, { className: string; label: string }> = {
  SYSTEM: { className: 'bg-[#EEF1EC] text-muted', label: 'System' },
  DEPOSIT: { className: 'bg-amber-light text-brass', label: 'Deposit' },
  CREDIT: { className: 'bg-teal-light text-teal', label: 'Credit' },
};

function TypeBadge({ type }: { type: LedgerType }) {
  const meta = TYPE_META[type];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${meta.className}`}>
      {meta.label}
    </span>
  );
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

function SummaryCard({
  label,
  value,
  accent,
  emphasized,
}: {
  label: string;
  value: number;
  accent?: 'coral' | 'teal';
  emphasized?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${emphasized ? 'border-ink bg-ink' : 'border-line bg-white'}`}
    >
      <p className={`m-0 text-xs uppercase tracking-wide ${emphasized ? 'text-[#B7BCB2]' : 'text-muted'}`}>{label}</p>
      <p
        className={`m-0 mt-1 font-mono-brand text-2xl font-semibold ${
          emphasized ? 'text-white' : accent === 'coral' ? 'text-coral' : accent === 'teal' ? 'text-teal' : 'text-ink'
        }`}
      >
        ₹{value.toLocaleString('en-IN')}
      </p>
    </div>
  );
}

// Add credit — modal (Amount, Note, optional Screenshot), covers both an advance
// deposit and an expense reimbursement claim in one action (spec's explicit "single
// action covers both").
function AddCreditModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('amount', amount);
      formData.append('note', note);
      if (file) formData.append('file', file);
      const res = await authedFetch('/api/me/ledger/credits', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit your credit.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ledger'] });
      onClose();
    },
  });

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setFileName(selected?.name ?? null);
  }

  return (
    <Modal title="Add credit" subtitle="From an advance deposit or an expense you've already paid" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        noValidate
      >
        <Field label="Amount (₹)">
          <input
            className={inputClass}
            type="number"
            min="1"
            step="0.01"
            placeholder="e.g. 1500"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="Note">
          <input
            className={inputClass}
            placeholder="e.g. Paid plumber for common area leak"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
          />
        </Field>
        <div className="mb-1">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Screenshot (optional)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            aria-label="Attach payment or bill screenshot"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-muted bg-transparent px-3 py-2.5 text-xs text-muted"
          >
            <Upload size={14} /> {fileName ?? 'Attach payment or bill screenshot'}
          </button>
        </div>
        <p className="m-0 mt-2.5 text-xs text-muted">
          Appears in your passbook as a pending Credit row until your admin approves it.
        </p>

        {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-3.5 flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          <Wallet size={14} /> {mutation.isPending ? 'Submitting…' : 'Submit for approval'}
        </button>
      </form>
    </Modal>
  );
}

// Pay — inline panel with a UPI QR for a resident-chosen amount (editable, capped at
// Payable, partial payment explicitly allowed). Submitting creates a PENDING Deposit;
// proof upload is optional (not required to submit, unlike the pre-pivot flow — see
// CLAUDE.md's ledger pivot note).
function PayPanel({ payable, onDone }: { payable: number; onDone: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(String(payable));
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const qrQuery = useQuery({
    queryKey: ['deposit-qr', amount],
    queryFn: async () => {
      const parsed = Number(amount);
      const res = await authedFetch('/api/me/ledger/deposits/qr', {
        method: 'POST',
        body: JSON.stringify({ amount: parsed }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not generate the payment QR.');
      return body as { amount: number; upiLink: string; qrDataUrl: string };
    },
    enabled: Number(amount) > 0 && Number(amount) <= payable,
  });

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('amount', amount);
      if (file) formData.append('file', file);
      const res = await authedFetch('/api/me/ledger/deposits', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit your payment.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ledger'] });
      onDone();
    },
  });

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setFileName(selected?.name ?? null);
  }

  return (
    <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-line bg-paper p-4">
      <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-md border border-line bg-white p-1">
        {qrQuery.data ? (
          <img src={qrQuery.data.qrDataUrl} alt="UPI payment QR code" className="h-full w-full" />
        ) : (
          <QrCode size={32} className="text-muted" />
        )}
      </div>
      <div className="min-w-52 flex-1">
        <label className="mb-1.5 block text-xs font-semibold text-muted">
          Amount to pay now (up to ₹{payable.toLocaleString('en-IN')})
        </label>
        <input
          className={`${inputClass} mb-2`}
          type="number"
          min="1"
          max={payable}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <p className="m-0 mb-2.5 text-xs text-muted">
          Paying less than the full amount is fine — this creates a Deposit entry, pending until your admin
          approves it.
        </p>
        {qrQuery.isError && <ErrorBanner>{(qrQuery.error as Error).message}</ErrorBanner>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-label="Upload payment proof (optional)"
          onChange={handleFileSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-dashed border-muted bg-transparent px-3 py-2 text-xs text-ink"
        >
          <Upload size={13} /> {fileName ?? 'Upload payment proof (optional)'}
        </button>

        {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !(Number(amount) > 0 && Number(amount) <= payable)}
          className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          {mutation.isPending ? 'Submitting…' : 'Submit payment'}
        </button>
      </div>
    </div>
  );
}

export function PassbookPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-ledger'], queryFn: fetchMyLedger });
  const [showPay, setShowPay] = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);

  const columns = useMemo<ColumnDef<LedgerRow, unknown>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <span>
            <span className="font-mono-brand text-ink">
              {row.original.type === 'SYSTEM' && row.original.period
                ? periodLabel(row.original.period)
                : dateLabel(row.original.date)}
            </span>
            {row.original.note && <div className="mt-0.5 text-xs text-muted">{row.original.note}</div>}
          </span>
        ),
      },
      {
        id: 'payer',
        header: 'Payer',
        cell: ({ row }) => <span className="text-muted">{row.original.payer}</span>,
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
          <span className={`font-mono-brand ${row.original.type === 'SYSTEM' ? 'text-ink' : 'text-teal'}`}>
            {row.original.type === 'SYSTEM' ? '' : '+'}₹{row.original.amount.toLocaleString('en-IN')}
          </span>
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
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Maintenance passbook</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your passbook.
        </p>
      )}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-4">
            <SummaryCard
              label="Outstanding"
              value={data.totals.outstanding}
              accent={data.totals.outstanding > 0 ? 'coral' : undefined}
            />
            <SummaryCard label="Credit balance" value={data.totals.creditBalance} accent="teal" />
            <SummaryCard label="Payable" value={data.totals.payable} emphasized />
          </div>

          <div className="mb-5 rounded-2xl border border-line bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                {data.totals.payable > 0 ? (
                  <span className="text-sm text-ink">
                    You owe{' '}
                    <strong className="font-mono-brand">₹{data.totals.payable.toLocaleString('en-IN')}</strong> after
                    approved credit
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-teal">
                    <CheckCircle2 size={16} /> Nothing payable right now
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCredit(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-muted bg-transparent px-3.5 py-2 text-xs font-semibold text-ink"
                >
                  <Wallet size={14} /> Add credit
                </button>
                {data.totals.payable > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPay((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
                  >
                    <QrCode size={14} /> Pay
                  </button>
                )}
              </div>
            </div>

            {showPay && data.totals.payable > 0 && (
              <PayPanel payable={data.totals.payable} onDone={() => setShowPay(false)} />
            )}

            {data.entries.length === 0 && (
              <p className="m-0 flex items-center gap-1.5 text-sm text-teal">
                <Check size={14} /> No entries yet
              </p>
            )}
          </div>

          <p className="m-0 mb-1 text-xs text-muted">
            Only approved entries count toward your Outstanding, Credit balance, and Payable above.
          </p>

          <DataTable
            data={data.entries}
            columns={columns}
            getRowId={(r) => r.id}
            emptyMessage="No entries yet."
          />
        </>
      )}

      {showAddCredit && <AddCreditModal onClose={() => setShowAddCredit(false)} />}
    </div>
  );
}
