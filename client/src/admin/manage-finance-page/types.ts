export type Direction = 'INCOME' | 'EXPENSE';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'OTHER';

export interface SocietyLedgerEntryRow {
  id: string;
  direction: Direction;
  amount: string;
  transactionDate: string;
  paymentMethod: PaymentMethod;
  bankReference: string | null;
  note: string | null;
  fileUrl: string | null;
  category: { id: string; name: string; direction: Direction };
  recordedBy: { id: string; name: string };
}

export interface FinanceCategoryOption {
  id: string;
  name: string;
  direction: Direction;
}
