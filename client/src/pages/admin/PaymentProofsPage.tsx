import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { authedFetch } from '../../lib/api';

type LedgerEntryType = 'DEPOSIT' | 'CREDIT';

interface LedgerEntryListItem {
  id: string;
  type: LedgerEntryType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  amount: string;
  note: string | null;
  fileUrl: string | null;
  createdAt: string;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
}

// Credit re-introduced 2026-08-07 — there's something to distinguish in this queue
// again (a Deposit is a UPI payment with a screenshot; a Credit is a committee-
// approved adjustment with a required reason instead), so the Type column returns
// after the 2026-08-07 Credit-removal pivot had dropped it for having nothing left
// to show.
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

async function fetchPendingLedgerEntries(): Promise<LedgerEntryListItem[]> {
  const res = await authedFetch('/api/admin/ledger-entries?status=PENDING');
  if (!res.ok) throw new Error('Could not load pending ledger entries.');
  return res.json();
}

// The file endpoint is authenticated (never a public URL), so a plain <a href> won't
// carry the Bearer token; fetch it ourselves and hand the browser a blob: URL instead.
// Works for both images and PDFs — the browser's own viewer opens either in the new tab.
async function viewProofFile(id: string) {
  const res = await authedFetch(`/api/ledger-entries/${id}/file`);
  if (!res.ok) throw new Error('Could not load the proof file.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Owns just the "View proof" button's own error state — split out from the row so
// each column's cell renderer is a small, independently-stateful component rather
// than one component owning an entire <tr> (that shape doesn't fit TanStack Table's
// per-cell rendering model, see DataTable.tsx).
function ProofFileCell({ entryId, hasFile }: { entryId: string; hasFile: boolean }) {
  const [viewError, setViewError] = useState<string | null>(null);

  if (!hasFile) return <span className="text-xs text-muted">No file attached</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setViewError(null);
          viewProofFile(entryId).catch((e: Error) => setViewError(e.message));
        }}
        className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Eye size={13} /> View proof
      </button>
      {viewError && <p className="mt-1 text-xs text-coral">{viewError}</p>}
    </>
  );
}

function EntryActionsCell({ entry }: { entry: LedgerEntryListItem }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/admin/ledger-entries/${entry.id}/approve`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not approve this entry.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-ledger-entries'] }),
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
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="flex items-center gap-1 rounded-md bg-teal px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-70"
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
      {approveMutation.error && (
        <p className="mt-1 text-xs text-coral">{(approveMutation.error as Error).message}</p>
      )}
      {rejectMutation.error && <p className="mt-1 text-xs text-coral">{(rejectMutation.error as Error).message}</p>}
    </>
  );
}

export function PaymentProofsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-ledger-entries'],
    queryFn: fetchPendingLedgerEntries,
  });

  const columns = useMemo<ColumnDef<LedgerEntryListItem, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
            <div className="text-xs text-muted">{row.original.payer.name}</div>
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
        header: 'Actions',
        cell: ({ row }) => <EntryActionsCell entry={row.original} />,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Payment proofs</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">{data?.length ?? 0} pending review</p>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load pending entries.
        </p>
      )}

      {data && <DataTable data={data} columns={columns} getRowId={(e) => e.id} emptyMessage="No pending proofs." />}
    </div>
  );
}
