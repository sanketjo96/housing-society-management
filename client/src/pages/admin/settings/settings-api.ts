import { authedFetch } from '../../../lib/api';

// Shared shape/query key across settings pages and FlatsListPage's FlatForm.
export interface SocietySettings {
  name: string;
  address: string;
  // "YYYY-MM-DD". Null only for societies that predate this field.
  constructionDate: string | null;
  formationDate: string | null;
  // UPI takes precedence over bank details when both are configured.
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  tenantRateFactor: number;
  defaultBaseRate: number;
  receiptNumberPrefix: string;
  receiptFooterNote: string | null;
  // Set from the Committee tab; print on every receipt's letterhead.
  hasChairmanSignature: boolean;
  hasSecretarySignature: boolean;
  hasTreasurerSignature: boolean;
  chairman: CommitteeMember | null;
  secretary: CommitteeMember | null;
  treasurer: CommitteeMember | null;
}

export interface CommitteeMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export async function fetchSettings(): Promise<SocietySettings> {
  const res = await authedFetch('/api/admin/settings');
  if (!res.ok) throw new Error('Could not load settings.');
  return res.json();
}

// Every owner in the society, deduped by id (derived from /api/admin/flats — no
// dedicated "list owners" endpoint exists).
export async function fetchOwners(): Promise<CommitteeMember[]> {
  const res = await authedFetch('/api/admin/flats');
  if (!res.ok) throw new Error('Could not load owners.');
  const flats = (await res.json()) as { owner: CommitteeMember }[];
  const byId = new Map(flats.map((f) => [f.owner.id, f.owner]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
