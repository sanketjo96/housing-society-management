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

// Bulk CSV import of the Flats/Owners/Tenants roster.
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
