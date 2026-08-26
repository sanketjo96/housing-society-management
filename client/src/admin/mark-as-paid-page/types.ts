import type { LedgerCategory } from '../_shared/components/ledger-category-badge/LedgerCategoryBadge';

export interface MarkAsPaidEntry {
  id: string;
  amount: string;
  category: LedgerCategory;
  createdAt: string;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
}

export interface FlatOption {
  id: string;
  wing: string;
  flatNumber: string;
  owner: { name: string };
}
