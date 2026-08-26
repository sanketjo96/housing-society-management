export type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

export interface OtherChargeListItem {
  id: string;
  amount: string;
  note: string | null;
  settlementStatus: SettlementStatus;
  settledAmount: number;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
  feeType: { id: string; name: string };
}

export interface OtherChargeDueRow {
  id: string;
  flat: { wing: string; flatNumber: string };
  payerName: string;
  feeTypeName: string;
  note: string | null;
  outstanding: number;
  settledAmount: number;
  amount: number;
  settlementStatus: SettlementStatus;
}
