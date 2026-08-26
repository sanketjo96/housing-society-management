export type LedgerCategory = 'MAINTENANCE' | 'OTHER_CHARGE';

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
