import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authedFetch } from '../lib/api';

// Small shared display pieces for a resident's ledger rows (approval-status badge,
// receipt download) — previously duplicated inline in ResidentDashboardOverview.tsx
// before the resident-dashboard restructure split its Deposit/Credit history out to
// MaintenanceBookPage.tsx and the new CreditBookPage.tsx, both of which need the
// exact same rendering.

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

// The issued-receipt endpoint is authenticated (never a public URL), so a plain
// <a href> won't carry the Bearer token — fetch it ourselves and hand the browser a
// blob: URL instead, same pattern the admin Payment Proofs queue uses for both proof
// files and receipts.
export async function downloadReceipt(entryId: string) {
  const res = await authedFetch(`/api/ledger-entries/${entryId}/receipt`);
  if (!res.ok) throw new Error('Could not load your receipt.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Owns its own error state — same reasoning as PaymentProofsPage.tsx's per-cell
// components (doesn't fit TanStack Table's per-cell rendering model otherwise).
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

// Same white-card/accent-color scheme as admin/AdminDashboardPage.tsx's SummaryCard
// (border-line, white background, coral for an outstanding debt, teal for a
// positive/credit figure) — the resident Dashboard previously used a dark "ink" card
// here, which read as a different design system from the admin dashboard entirely.
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
