import { CsvImportPanel } from '../../components/CsvImportPanel';

interface FlatsImportResult {
  created: unknown[];
  errors: { row: number; message: string }[];
}

// Header + one worked example row — used both as the downloadable template's content
// and as the source of the column list shown in the panel's description.
const FLATS_CSV_TEMPLATE =
  'wing,flatNumber,ownerName,ownerPhone,ownerEmail,occupancy,tenantName,tenantPhone,tenantEmail\n' +
  'A,101,Priya Nair,9876543210,priya@example.com,owner,,,\n';

// The "Resident" child page under the "Imports" submenu (DashboardLayout.tsx) —
// currently just the Flats/Owners/Tenants roster import (previously embedded inline
// on FlatsListPage.tsx, moved here 2026-08-21 so it reads as its own nav destination
// rather than being buried inside the page whose table it happens to populate).
// Named after what it imports (residents/flats), not generically "Imports" — that
// label belongs to the submenu group. Sibling pages for the two other importers
// sketched in docs/society-onboarding/ (Opening Balance/Other Charges, historical
// Manage Finance) live alongside this one: BulkChargesImportPage.tsx and
// FinanceHistoryImportPage.tsx.
export function ImportsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="m-0 mb-1 font-display text-xl text-ink">Resident import</h1>
      <p className="m-0 mb-6 text-xs text-muted">Bulk-load flats, owners &amp; tenants into this society via CSV.</p>

      <CsvImportPanel<FlatsImportResult>
        title="Flats, owners & tenants"
        description={
          <>
            Required columns: wing, flatNumber, ownerName, ownerPhone, ownerEmail. Optional:
            occupancy (owner/tenant), tenantName, tenantPhone, tenantEmail, effectiveFrom. Every
            imported flat takes the Billing plan page's default base rate — edit a flat afterward to
            set a different rate.
          </>
        }
        endpoint="/api/admin/flats/import"
        templateFilename="flats-import-template.csv"
        templateContent={FLATS_CSV_TEMPLATE}
        invalidateQueryKeys={[['admin-flats']]}
        renderSuccessMessage={(data) => `${data.created.length} flat(s) created.`}
      />
    </div>
  );
}
