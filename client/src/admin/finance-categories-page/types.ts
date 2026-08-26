export type Direction = 'INCOME' | 'EXPENSE';

export interface FinanceCategory {
  id: string;
  name: string;
  description: string | null;
  direction: Direction;
  isActive: boolean;
}
