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

export type VehicleType = 'TWO_WHEELER' | 'FOUR_WHEELER';

export interface Vehicle {
  id: string;
  plateNumber: string;
  type: VehicleType;
  createdAt: string;
}
