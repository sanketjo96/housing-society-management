import { authedFetch } from '../../../lib/api';

// Shared across the settings pages (SocietyDetailsPage, BillingPlanPage) plus
// FlatsListPage's FlatForm (pre-fills a new flat's base rate) — one settings shape,
// one query key (['society-settings']), so React Query dedups the fetch across
// pages instead of each page hitting the endpoint again.
export interface SocietySettings {
  name: string;
  address: string;
  // Required going forward (Basic information tab) — "YYYY-MM-DD", matching an
  // <input type="date">'s value format. Nullable only because societies that
  // existed before this field was added haven't been filled in yet.
  constructionDate: string | null;
  formationDate: string | null;
  // UPI always takes precedence over bank details when both are configured (see
  // ledger.service.ts's buildPaymentIntentResult) — a resident only ever sees one
  // or the other in the Pay flow, never both.
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  tenantRateFactor: number;
  defaultBaseRate: number;
  // Receipt template customization (Receipt Generation & Approval Workflow,
  // 2026-08-11) — see docs/receipts.md. receiptNumberPrefix is editable from the
  // Basic information tab above (2026-08-18 addendum: the standalone Receipt
  // template page was removed). receiptFooterNote has no admin UI anymore but
  // stays a valid, API-settable field — still rendered on a receipt if already set.
  receiptNumberPrefix: string;
  receiptFooterNote: string | null;
  // Committee-member signatures (2026-08-17), managed from the Committee tab.
  // Chairman/secretary print on every receipt's letterhead (2026-08-17 addendum);
  // treasurer's is a Committee-tab-only record, unrelated to receipts.
  hasChairmanSignature: boolean;
  hasSecretarySignature: boolean;
  hasTreasurerSignature: boolean;
  // Committee tab — each independently nullable, set from a dropdown of this
  // society's owners (never freely typed). Informational only.
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

// The Committee tab's dropdown source — every owner in the society, deduped by id
// (an owner can own more than one flat). No dedicated "list owners" endpoint exists;
// /api/admin/flats already returns each flat's owner, the same data
// AdminDashboardPage's Total Owners tile already derives its count from.
export async function fetchOwners(): Promise<CommitteeMember[]> {
  const res = await authedFetch('/api/admin/flats');
  if (!res.ok) throw new Error('Could not load owners.');
  const flats = (await res.json()) as { owner: CommitteeMember }[];
  const byId = new Map(flats.map((f) => [f.owner.id, f.owner]));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
