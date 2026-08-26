import type { ResidentSummary } from '../../types';

export interface FlatSummary {
  id: string;
  wing: string;
  flatNumber: string;
  currentTenant: ResidentSummary | null;
}

export interface TenantRow {
  flat: { id: string; wing: string; flatNumber: string };
  tenant: ResidentSummary;
}
