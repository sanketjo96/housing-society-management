import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, PlusCircle } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../components/FormField';
import { FileUploadField } from '../components/FileUploadField';
import {
  ApprovalBadge,
  type ApprovalStatus,
  dateLabel,
  ReceiptDownloadButton,
  SummaryCard,
} from '../components/LedgerEntryDisplay';
import { Modal } from '../components/Modal';
import { authedFetch } from '../lib/api';

interface CreditRow {
  id: string;
  date: string;
  amount: number;
  status: ApprovalStatus;
  note?: string | null;
  hasReceipt: boolean;
}

interface LedgerResponse {
  entries: {
    id: string;
    type: string;
    date: string;
    amount: number;
    status?: string;
    note?: string | null;
    hasReceipt?: boolean;
  }[];
  totals: { availableCredit: number };
}

// Reuses GET /api/me/ledger (no `year` param — lifetime, category defaults to
// MAINTENANCE, which is the only category createCredit ever writes to) and filters
// to CREDIT rows client-side — the resident-dashboard restructure's "Credit Book"
// page, sibling to MaintenanceBookPage.tsx/OtherChargesBookPage.tsx, both of which
// follow the same "the data is already there" pattern rather than a dedicated
// backend endpoint.
async function fetchCreditBook(): Promise<{ rows: CreditRow[]; availableCredit: number }> {
  const res = await authedFetch('/api/me/ledger');
  if (!res.ok) throw new Error('Could not load your credit book.');
  const body: LedgerResponse = await res.json();
  const rows = body.entries
    .filter((e) => e.type === 'CREDIT')
    .map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      status: (e.status ?? 'PENDING') as ApprovalStatus,
      note: e.note,
      hasReceipt: e.hasReceipt ?? false,
    }));
  return { rows, availableCredit: body.totals.availableCredit };
}

const columns: ColumnDef<CreditRow, unknown>[] = [
  {
    id: 'date',
    header: 'Date',
    cell: ({ row }) => (
      <span>
        <span className="font-mono-brand text-ink">{dateLabel(row.original.date)}</span>
        {row.original.note && <div className="mt-0.5 text-xs text-muted">{row.original.note}</div>}
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
  {
    id: 'receipt',
    header: '',
    cell: ({ row }) =>
      row.original.status === 'APPROVED' && row.original.hasReceipt ? (
        <ReceiptDownloadButton entryId={row.original.id} />
      ) : null,
  },
];

// A committee-approved adjustment against the flat's balance (e.g. a repair cost the
// owner wants settled against maintenance) — resident-submitted like a Deposit, but
// amount isn't capped at Outstanding (createCredit's own validation is just
// `amount > 0`) and both a reason note *and* a proof attachment (receipt/invoice/
// photo) are required — unlike a Deposit's optional screenshot, an arbitrary
// discretionary adjustment needs independent evidence for the committee to evaluate
// it, not just a self-reported amount. Starts PENDING and has zero effect on any
// balance until an admin approves it.
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
      queryClient.invalidateQueries({ queryKey: ['my-credits'] });
      // Available Credit also shows on the Dashboard card — keep it in sync.
      queryClient.invalidateQueries({ queryKey: ['my-balances'] });
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

// Credit-only view — the resident-dashboard restructure's "Credit Book" page,
// reached only via the Dashboard's "Available Maintenance Credit" card (same
// drill-down convention as /other-charges-book, docs/other-charges/), not a sidebar
// item. No Pay control here — Credit is requested/approved, never paid via UPI;
// that's what distinguishes it from Maintenance/Other Charges.
export function CreditBookPage() {
  const [showCreditModal, setShowCreditModal] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-credits'], queryFn: fetchCreditBook });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Credit book</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your credit book.
        </p>
      )}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4">
            <SummaryCard
              label="Available Maintenance Credit"
              value={data.availableCredit}
              accent={data.availableCredit > 0 ? 'teal' : undefined}
            />
            <div className="flex items-center justify-center rounded-2xl border border-line bg-white p-5">
              <button
                type="button"
                onClick={() => setShowCreditModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-brass px-4 py-2 text-sm font-semibold text-brass"
              >
                <PlusCircle size={14} /> Add credit
              </button>
            </div>
          </div>

          {data.rows.length === 0 ? (
            <p className="m-0 flex items-center gap-1.5 text-sm text-teal">
              <Check size={14} /> No credit requests yet
            </p>
          ) : (
            <DataTable data={data.rows} columns={columns} getRowId={(r) => r.id} emptyMessage="No credit requests yet." />
          )}
        </>
      )}

      {showCreditModal && <AddCreditModal onClose={() => setShowCreditModal(false)} />}
    </div>
  );
}
