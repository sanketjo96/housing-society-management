// Shared API response shapes used by more than one page — kept here instead of
// re-declared per-file (MyDetailsPage.tsx and admin/FlatsListPage.tsx both consume
// owner/tenant contact summaries from different endpoints, but the shape is identical).
export interface ResidentSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}
