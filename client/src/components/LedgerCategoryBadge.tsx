export type LedgerCategory = 'MAINTENANCE' | 'OTHER_CHARGE';

// Shared by PaymentProofsPage (the approval queue) and ReceiptBookPage (the issued-
// receipt register) — both need to distinguish which balance pool a row affects
// (docs/other-charges/), independent of Type (Deposit/Credit) and Created by
// (Owner/Tenant/Admin) — a single row is independently described by all three axes.
const CATEGORY_META: Record<LedgerCategory, { className: string; label: string }> = {
  MAINTENANCE: { className: 'border border-line text-ink', label: 'Maintenance' },
  OTHER_CHARGE: { className: 'border border-brass text-brass', label: 'Other Charge' },
};

export function LedgerCategoryBadge({ category }: { category: LedgerCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}
