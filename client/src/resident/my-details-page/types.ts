import type { ResidentSummary } from '../../types';

export interface MyFlat {
  id: string;
  wing: string;
  flatNumber: string;
  baseRate: string;
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
  occupancyEffectiveFrom: string | null;
}
