import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { authedFetch } from '../../lib/api';

interface ProofListItem {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  uploadedBy: { id: string; name: string; email: string };
  maintenanceRecords: {
    id: string;
    period: string;
    amount: string;
    flat: { id: string; wing: string; flatNumber: string };
  }[];
}

async function fetchPendingProofs(): Promise<ProofListItem[]> {
  const res = await authedFetch('/api/admin/payment-proofs?status=PENDING');
  if (!res.ok) throw new Error('Could not load payment proofs.');
  return res.json();
}

// The file endpoint is authenticated (never a public URL — Task 6.3), so a plain <a
// href> won't carry the Bearer token; fetch it ourselves and hand the browser a
// blob: URL instead. Works for both images and PDFs — the browser's own viewer opens
// either in the new tab.
async function viewProofFile(id: string) {
  const res = await authedFetch(`/api/payment-proofs/${id}/file`);
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
function ProofFileCell({ proofId }: { proofId: string }) {
  const [viewError, setViewError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setViewError(null);
          viewProofFile(proofId).catch((e: Error) => setViewError(e.message));
        }}
        className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Eye size={13} /> View proof
      </button>
      {viewError && <p className="mt-1 text-xs text-coral">{viewError}</p>}
    </>
  );
}

function ProofActionsCell({ proof }: { proof: ProofListItem }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/admin/payment-proofs/${proof.id}/approve`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not approve this proof.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-payment-proofs'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/admin/payment-proofs/${proof.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not reject this proof.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-payment-proofs'] }),
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
            aria-label={`Rejection reason for ${proof.uploadedBy.name}'s proof`}
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
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-payment-proofs'], queryFn: fetchPendingProofs });

  const columns = useMemo<ColumnDef<ProofListItem, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => {
          const flat = row.original.maintenanceRecords[0]?.flat;
          return (
            <span className="text-ink">
              {flat ? `${flat.wing}-${flat.flatNumber}` : '—'}
              <div className="text-xs text-muted">{row.original.uploadedBy.name}</div>
            </span>
          );
        },
      },
      {
        id: 'periods',
        header: 'Period(s)',
        cell: ({ row }) => (
          <span className="text-muted">{row.original.maintenanceRecords.map((r) => r.period).join(', ')}</span>
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const total = row.original.maintenanceRecords.reduce((sum, r) => sum + Number(r.amount), 0);
          return <span className="font-mono-brand text-ink">₹{total.toLocaleString('en-IN')}</span>;
        },
      },
      {
        id: 'proof',
        header: 'Proof',
        cell: ({ row }) => <ProofFileCell proofId={row.original.id} />,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <ProofActionsCell proof={row.original} />,
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
          Could not load payment proofs.
        </p>
      )}

      {data && <DataTable data={data} columns={columns} getRowId={(p) => p.id} emptyMessage="No pending proofs." />}
    </div>
  );
}
