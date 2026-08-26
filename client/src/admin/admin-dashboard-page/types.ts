import type { ResidentSummary } from '../../types';

export interface DashboardSummary {
  totalBilled: number;
  totalPaid: number;
  outstandingTotal: number;
  pendingReviewTotal: number;
  collectionRatePercent: number;
  // Other Charges pool — separate from maintenance figures above.
  otherChargesOutstandingTotal: number;
  totalOutstandingTotal: number;
  // Society's own income/expenditure, not resident billing.
  societyTotalIncome: number;
  societyTotalExpense: number;
  societyNetPosition: number;
}

export interface FlatDues {
  flat: { id: string; wing: string; flatNumber: string };
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
  paidTotal: number;
  outstandingTotal: number;
  creditTotal: number;
}

export interface PendingProofsResponse {
  fileUrl: string | null;
}
