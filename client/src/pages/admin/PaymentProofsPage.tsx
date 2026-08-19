import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, Check, Download, Eye, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../../components/FormField';
import { LedgerTypeBadge, type LedgerEntryType } from '../../components/LedgerTypeBadge';
import { Modal } from '../../components/Modal';
import { ReceiptApprovalModal } from '../../components/ReceiptApprovalModal';
import { authedFetch } from '../../lib/api';
import { downloadAuthedFile } from '../../lib/download-file';

type LedgerEntryStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type CreatedByType = 'OWNER' | 'TENANT' | 'ADMIN';

interface LedgerEntryListItem {
  id: string;
  type: LedgerEntryType;
  status: LedgerEntryStatus;
  amount: string;
  note: string | null;
  fileUrl: string | null;
  createdAt: string;
  createdByType: CreatedByType;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
}

// Who actually created the row — distinct from the payer it's for. An ADMIN-created
// entry with no proof attached is exactly a manualDeposit (cash/bank transfer, no
// UPI screenshot) — this badge is the direct, structured way to see that, instead of
// reading `note` text or cross-referencing AuditLog.
const CREATED_BY_META: Record<CreatedByType, { className: string; label: string }> = {
  OWNER: { className: 'border border-line text-ink', label: 'Owner' },
  TENANT: { className: 'border border-line text-ink', label: 'Tenant' },
  ADMIN: { className: 'border border-teal text-teal', label: 'Admin' },
};

function CreatedByBadge({ type }: { type: CreatedByType }) {
  const meta = CREATED_BY_META[type];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

interface FlatOption {
  id: string;
  wing: string;
  flatNumber: string;
  owner: { name: string };
}

async function fetchFlatOptions(): Promise<FlatOption[]> {
  const res = await authedFetch('/api/admin/flats');
  if (!res.ok) throw new Error('Could not load flats.');
  return res.json();
}

// The admin fallback for a payment that never went through the UPI flow — cash
// handed to the treasurer, or a bank transfer done outside the app. Creates an
// already-APPROVED Deposit directly (manualDeposit, admin-ledger-service.ts) —
// there's no screenshot to review, so no PENDING step. Success deliberately doesn't
// auto-close into the table: the created entry has no fileUrl, so it won't appear
// in the Approved tab (this page's own existing filter, below) — closing into a
// table that doesn't reflect what just happened would be confusing.
function MarkAsPaidModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [flatId, setFlatId] = useState('');
  const [amount, setAmount] = useState('');
  const [succeeded, setSucceeded] = useState(false);

  const { data: flats, isLoading: flatsLoading } = useQuery({
    queryKey: ['admin-flats-options'],
    queryFn: fetchFlatOptions,
  });

  const parsedAmount = Number(amount);
  const isAmountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;

  const submitMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch('/api/admin/ledger-entries/manual-deposit', {
        method: 'POST',
        body: JSON.stringify({ flatId, amount: parsedAmount }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not mark this payment as paid.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ledger-entries'] });
      // manualDeposit also issues a real Receipt (admin-ledger-service.ts) —
      // without this, the Receipt Book page's cached list (30s staleTime,
      // App.tsx) can silently miss the one just issued.
      queryClient.invalidateQueries({ queryKey: ['admin-receipts'] });
      setSucceeded(true);
    },
  });

  if (succeeded) {
    return (
      <Modal title="Mark as paid" onClose={onClose}>
        <p className="m-0 mb-3.5 flex items-center gap-1.5 text-sm font-semibold text-teal">
          <Check size={14} /> Marked as paid.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white"
        >
          Done
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      title="Mark as paid"
      subtitle="For a payment received outside the app — cash or a direct bank transfer."
      onClose={onClose}
    >
      <Field label="Flat">
        <select
          value={flatId}
          onChange={(e) => setFlatId(e.target.value)}
          disabled={flatsLoading}
          className={inputClass}
        >
          <option value="">Select a flat…</option>
          {flats?.map((flat) => (
            <option key={flat.id} value={flat.id}>
              {flat.wing}-{flat.flatNumber} — {flat.owner.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={0.01}
          step="0.01"
          className={inputClass}
        />
        {!isAmountValid && amount.length > 0 && <ErrMsg>Enter an amount greater than 0.</ErrMsg>}
      </Field>

      {submitMutation.error && <ErrorBanner>{submitMutation.error.message}</ErrorBanner>}

      <button
        type="button"
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || !flatId || !isAmountValid}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        {submitMutation.isPending ? 'Marking as paid…' : 'Mark as paid'}
      </button>
    </Modal>
  );
}

const STATUS_TABS: { value: LedgerEntryStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

async function fetchLedgerEntries(status: LedgerEntryStatus): Promise<LedgerEntryListItem[]> {
  const res = await authedFetch(`/api/admin/ledger-entries?status=${status}`);
  if (!res.ok) throw new Error('Could not load ledger entries.');
  return res.json();
}

// Owns just the "View proof" button's own error state — split out from the row so
// each column's cell renderer is a small, independently-stateful component rather
// than one component owning an entire <tr> (that shape doesn't fit TanStack Table's
// per-cell rendering model, see DataTable.tsx). A fileless row is only guaranteed
// impossible on the Pending tab (filtered in PaymentProofsPage below) — Approved and
// Rejected are unfiltered historical records, so a manually-marked-paid entry can
// still reach here with no file.
function ProofFileCell({ entryId, hasFile }: { entryId: string; hasFile: boolean }) {
  const [viewError, setViewError] = useState<string | null>(null);

  if (!hasFile) return <span className="text-xs text-muted">No file attached</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setViewError(null);
          downloadAuthedFile(`/api/ledger-entries/${entryId}/file`, 'Could not load the proof file.').catch(
            (e: Error) => setViewError(e.message),
          );
        }}
        className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Eye size={13} /> View proof
      </button>
      {viewError && <p className="mt-1 text-xs text-coral">{viewError}</p>}
    </>
  );
}

// Approved rows only — a legacy entry approved before the Receipt Generation &
// Approval Workflow shipped (2026-08-11) has no Receipt row, so a 404 here is
// expected and shown inline rather than treated as a bug.
function ReceiptDownloadCell({ entryId }: { entryId: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          downloadAuthedFile(`/api/ledger-entries/${entryId}/receipt`, 'No receipt was issued for this entry.').catch(
            (e: Error) => setError(e.message),
          );
        }}
        className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Download size={13} /> Download receipt
      </button>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </>
  );
}

function EntryActionsCell({ entry }: { entry: LedgerEntryListItem }) {
  const queryClient = useQueryClient();
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  // Approve no longer settles the entry directly — it opens ReceiptApprovalModal
  // first (the "receipt validation modal" requirement); this mutation is now fired
  // by the modal's "Confirm and approve" button, not by clicking Approve itself.
  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/admin/ledger-entries/${entry.id}/approve`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not approve this entry.');
      return body;
    },
    onSuccess: () => {
      setShowApprovalModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin-ledger-entries'] });
      // Approval also issues a real Receipt (approveLedgerEntry, admin-ledger-
      // service.ts) — without this, the Receipt Book page's cached list (30s
      // staleTime, App.tsx) can silently miss the one just issued.
      queryClient.invalidateQueries({ queryKey: ['admin-receipts'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/admin/ledger-entries/${entry.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not reject this entry.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ledger-entries'] }),
  });

  return (
    <>
      {!rejecting && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowApprovalModal(true)}
            className="flex items-center gap-1 rounded-md bg-teal px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            <Check size={12} /> Approve
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink"
          >
            <X size={12} /> Reject
          </button>
        </div>
      )}
      {rejecting && (
        <div className="flex flex-col gap-1.5">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            aria-label={`Rejection reason for ${entry.payer.name}'s entry`}
            className="rounded-md border border-line px-2 py-1 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              className="rounded-md bg-coral px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-70"
            >
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {rejectMutation.error && <p className="mt-1 text-xs text-coral">{(rejectMutation.error as Error).message}</p>}

      {showApprovalModal && (
        <ReceiptApprovalModal
          entryId={entry.id}
          residentName={entry.payer.name}
          onCancel={() => setShowApprovalModal(false)}
          onConfirm={() => approveMutation.mutate()}
          isConfirming={approveMutation.isPending}
          confirmError={(approveMutation.error as Error | null)?.message}
        />
      )}
    </>
  );
}

export function PaymentProofsPage() {
  const [status, setStatus] = useState<LedgerEntryStatus>('PENDING');
  const [showMarkAsPaidModal, setShowMarkAsPaidModal] = useState(false);
  const { data: fetched, isLoading, isError } = useQuery({
    queryKey: ['admin-ledger-entries', status],
    queryFn: () => fetchLedgerEntries(status),
  });

  // Pending and Approved both only show entries with an actual proof attached — a
  // manually-marked-paid entry (no screenshot) or a Deposit submitted through the
  // lower-level, no-file-required primitive has nothing to review/display here, so
  // it's excluded rather than shown with a "No file attached" placeholder. Rejected
  // stays unfiltered — every rejected submission is worth keeping visible regardless
  // of whether it had a proof, since rejection itself doesn't hinge on that.
  const data = useMemo(
    () => (status === 'REJECTED' ? fetched : fetched?.filter((e) => e.fileUrl)),
    [fetched, status],
  );

  const columns = useMemo<ColumnDef<LedgerEntryListItem, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        meta: { headerClassName: 'w-36', cellClassName: 'w-36 max-w-36' },
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
            <div className="text-xs text-muted">{row.original.payer.name}</div>
            {row.original.type === 'CREDIT' && row.original.note && (
              <div className="mt-0.5 whitespace-normal break-words text-xs text-muted">{row.original.note}</div>
            )}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => <LedgerTypeBadge type={row.original.type} />,
      },
      {
        id: 'createdBy',
        header: 'Created by',
        cell: ({ row }) => <CreatedByBadge type={row.original.createdByType} />,
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">₹{Number(row.original.amount).toLocaleString('en-IN')}</span>
        ),
      },
      {
        id: 'proof',
        header: 'Proof',
        cell: ({ row }) => <ProofFileCell entryId={row.original.id} hasFile={!!row.original.fileUrl} />,
      },
      {
        id: 'actions',
        header: status === 'APPROVED' ? 'Receipt' : 'Actions',
        cell: ({ row }) => {
          if (row.original.status === 'PENDING') return <EntryActionsCell entry={row.original} />;
          if (row.original.status === 'APPROVED') return <ReceiptDownloadCell entryId={row.original.id} />;
          return <span className="text-xs text-muted">{row.original.note ?? '—'}</span>;
        },
      },
    ],
    [status],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-xl text-ink">Payment proofs</h1>
          <p className="m-0 mt-0.5 text-xs text-muted">{data?.length ?? 0} entries</p>
        </div>
        <button
          type="button"
          onClick={() => setShowMarkAsPaidModal(true)}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-ink"
        >
          <Banknote size={14} /> Mark as paid
        </button>
      </div>

      <div className="mb-4 flex gap-2" role="tablist">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setStatus(tab.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              status === tab.value ? 'bg-teal text-white' : 'border border-line text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load ledger entries.
        </p>
      )}

      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(e) => e.id}
          emptyMessage={`No ${status.toLowerCase()} entries.`}
        />
      )}

      {showMarkAsPaidModal && <MarkAsPaidModal onClose={() => setShowMarkAsPaidModal(false)} />}
    </div>
  );
}
