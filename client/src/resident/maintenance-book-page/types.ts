import type { ApprovalStatus } from '../_shared/components/ledger-entry-display/LedgerEntryDisplay';

export type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

export interface MaintenanceRow {
  id: string;
  period: string;
  date: string;
  amount: number;
  settledAmount: number;
  settlementStatus: SettlementStatus;
}

export interface DepositRow {
  id: string;
  date: string;
  amount: number;
  status: ApprovalStatus;
  hasReceipt: boolean;
  // The resident's own submitted reason, if any (bank-reference/pay-modal note).
  note?: string | null;
  // The admin's rejection reason — only meaningful when status is 'REJECTED'.
  adminNote?: string | null;
}

export interface LedgerResponse {
  entries: {
    id: string;
    type: string;
    period?: string;
    date: string;
    amount: number;
    status?: string;
    settledAmount?: number;
    settlementStatus?: SettlementStatus;
    hasReceipt?: boolean;
    note?: string | null;
    adminNote?: string | null;
  }[];
  totals: { totalCharges: number; outstanding: number };
}

export interface MaintenanceBookData {
  chargeRows: MaintenanceRow[];
  depositRows: DepositRow[];
  outstanding: number;
}

export type SortKey = 'date' | 'amount';
export type SortDir = 'asc' | 'desc';

export type BookTab = 'BILLS' | 'PAYMENTS';
