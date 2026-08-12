import { authedFetch } from '../../../lib/api';

// Shared across the three settings pages (SocietyDetailsPage, BillingPlanPage,
// ReceiptTemplatePage) plus FlatsListPage's FlatForm (pre-fills a new flat's base
// rate) — one settings shape, one query key (['society-settings']), so React Query
// dedups the fetch across pages instead of each page hitting the endpoint again.
export interface SocietySettings {
  name: string;
  address: string;
  // UPI always takes precedence over bank details when both are configured (see
  // ledger.service.ts's buildPaymentIntentResult) — a resident only ever sees one
  // or the other in the Pay flow, never both.
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  tenantRateFactor: number;
  defaultBaseRate: number;
  // Receipt template customization (Receipt Generation & Approval Workflow,
  // 2026-08-11) — see docs/receipts.md.
  receiptNumberPrefix: string;
  receiptSignatoryName: string | null;
  receiptSignatoryTitle: string | null;
  receiptFooterNote: string | null;
  hasSignature: boolean;
}

export async function fetchSettings(): Promise<SocietySettings> {
  const res = await authedFetch('/api/admin/settings');
  if (!res.ok) throw new Error('Could not load settings.');
  return res.json();
}
