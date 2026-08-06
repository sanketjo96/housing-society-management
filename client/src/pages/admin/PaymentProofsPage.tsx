import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, X } from 'lucide-react';
import { useState } from 'react';
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

function ProofRow({ proof }: { proof: ProofListItem }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [viewError, setViewError] = useState<string | null>(null);

  const total = proof.maintenanceRecords.reduce((sum, r) => sum + Number(r.amount), 0);
  const periods = proof.maintenanceRecords.map((r) => r.period).join(', ');
  const flat = proof.maintenanceRecords[0]?.flat;

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
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-3 text-ink">
        {flat ? `${flat.wing}-${flat.flatNumber}` : '—'}
        <div className="text-xs text-muted">{proof.uploadedBy.name}</div>
      </td>
      <td className="px-4 py-3 text-muted">{periods}</td>
      <td className="px-4 py-3 text-right font-mono-brand text-ink">₹{total.toLocaleString('en-IN')}</td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setViewError(null);
            viewProofFile(proof.id).catch((e: Error) => setViewError(e.message));
          }}
          className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
        >
          <Eye size={13} /> View proof
        </button>
        {viewError && <p className="mt-1 text-xs text-coral">{viewError}</p>}
      </td>
      <td className="px-4 py-3">
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
      </td>
    </tr>
  );
}

export function PaymentProofsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-payment-proofs'], queryFn: fetchPendingProofs });

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

      {data && (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold">Period(s)</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Proof</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <ProofRow key={p.id} proof={p} />
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                    No pending proofs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
