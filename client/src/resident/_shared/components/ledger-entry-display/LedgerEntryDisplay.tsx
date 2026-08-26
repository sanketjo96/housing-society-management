import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authedFetch } from '../../../../lib/api';

export type ApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

const STATUS_META: Record<ApprovalStatus, { className: string; label: string }> = {
  APPROVED: { className: 'bg-teal-light text-teal', label: 'Approved' },
  PENDING: { className: 'bg-amber-light text-brass', label: 'Pending' },
  REJECTED: { className: 'bg-coral-light text-coral', label: 'Rejected' },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Authenticated endpoint — a plain <a href> can't carry the Bearer token, so
// fetch and hand off a blob: URL instead.
export async function downloadReceipt(entryId: string) {
  const res = await authedFetch(`/api/ledger-entries/${entryId}/receipt`);
  if (!res.ok) throw new Error('Could not load your receipt.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ReceiptDownloadButton({ entryId }: { entryId: string }) {
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

// Coral for an outstanding debt, teal for a positive/credit figure.
export function SummaryCard({
  label,
  value,
  accent,
  to,
}: {
  label: string;
  value: number;
  accent?: 'coral' | 'teal';
  to?: string;
}) {
  const content = (
    <>
      <p className="m-0 text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`m-0 mt-1 font-mono-brand text-2xl font-semibold ${accent === 'coral' ? 'text-coral' : accent === 'teal' ? 'text-teal' : 'text-ink'}`}
      >
        ₹{value.toLocaleString('en-IN')}
      </p>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="block rounded-2xl border border-line bg-white p-5 hover:border-teal">
        {content}
      </Link>
    );
  }

  return <div className="rounded-2xl border border-line bg-white p-5">{content}</div>;
}
