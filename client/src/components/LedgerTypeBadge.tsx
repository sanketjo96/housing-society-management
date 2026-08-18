export type LedgerEntryType = 'DEPOSIT' | 'CREDIT';

// Shared by PaymentProofsPage (the approval queue) and ReceiptBookPage (the issued-
// receipt register) — both need to distinguish a Deposit (a UPI payment) from a
// Credit (a committee-approved adjustment) the same way.
const TYPE_META: Record<LedgerEntryType, { className: string; label: string }> = {
  DEPOSIT: { className: 'border border-line text-ink', label: 'Deposit' },
  CREDIT: { className: 'border border-brass text-brass', label: 'Credit' },
};

export function LedgerTypeBadge({ type }: { type: LedgerEntryType }) {
  const meta = TYPE_META[type];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}
