export type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

export interface OtherChargeListItem {
  id: string;
  amount: string;
  note: string | null;
  dueDate: string;
  createdAt: string;
  settlementStatus: SettlementStatus;
  settledAmount: number;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
  feeType: { id: string; name: string };
  billedBy: { id: string; name: string };
}

export interface FlatOption {
  id: string;
  wing: string;
  flatNumber: string;
  owner: { name: string };
}

// Shown to users as "Custom fee"; model/route names still say FeeType.
export interface FeeTypeOption {
  id: string;
  name: string;
}
