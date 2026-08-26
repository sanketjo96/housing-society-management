import type { ApprovalStatus } from '../_shared/components/ledger-entry-display/LedgerEntryDisplay';

export type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

export interface OtherChargeRow {
  id: string;
  feeTypeName?: string;
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
    feeTypeName?: string;
    date: string;
    amount: number;
    status?: string;
    settledAmount?: number;
    settlementStatus?: SettlementStatus;
    hasReceipt?: boolean;
  }[];
  totals: { totalCharges: number; outstanding: number };
}

export interface OtherChargesBookData {
  chargeRows: OtherChargeRow[];
  depositRows: DepositRow[];
  totalOtherChargesAmount: number;
  outstanding: number;
}

export type SortKey = 'date' | 'amount';
export type SortDir = 'asc' | 'desc';

export type BookTab = 'BILLS' | 'PAYMENTS';
