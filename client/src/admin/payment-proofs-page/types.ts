import type { LedgerCategory } from '../_shared/components/ledger-category-badge/LedgerCategoryBadge';

export type LedgerEntryStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CreatedByType = 'OWNER' | 'TENANT' | 'ADMIN';

export interface LedgerEntryListItem {
  id: string;
  status: LedgerEntryStatus;
  amount: string;
  note: string | null;
  fileUrl: string | null;
  createdAt: string;
  createdByType: CreatedByType;
  category: LedgerCategory;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
}
