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
  }[];
  totals: { totalCharges: number; outstanding: number };
}

export interface MaintenanceBookData {
  chargeRows: MaintenanceRow[];
  depositRows: DepositRow[];
  totalMaintenanceAmount: number;
  outstanding: number;
}

export type SortKey = 'date' | 'amount';
export type SortDir = 'asc' | 'desc';

export type BookTab = 'BILLS' | 'PAYMENTS';
