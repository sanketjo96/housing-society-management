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
  availableYears: number[];
  // Complaints — summary cards with counts, not a list (the resident
  // dashboard shows the full ranked list instead).
  openComplaintsCount: number;
  complaintCountsByStatus: {
    OPEN: number;
    IN_PROGRESS: number;
    RESOLVED: number;
    REJECTED: number;
  };
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
