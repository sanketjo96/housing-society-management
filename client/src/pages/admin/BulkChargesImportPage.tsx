import { CsvImportPanel } from '../../components/CsvImportPanel';

interface BulkChargesImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

const CHARGES_CSV_TEMPLATE =
  'wing,flatnumber,pool,feetypename,amount,note\n' +
  'A,101,MAINTENANCE_OPENING_BALANCE,,45000,Legacy arrears as of go-live\n' +
  'A,101,OTHER_CHARGE,Water Connection,1500,\n';

// The "Charges" child page under the "Imports" submenu (DashboardLayout.tsx) — Phase
// C of docs/society-onboarding/. Each CSV row is matched to an existing flat by
// wing+flatNumber (import on the "Resident" page first) and branches on `pool`:
// MAINTENANCE_OPENING_BALANCE creates a one-time pre-go-live arrears charge that
// always settles before every real month; OTHER_CHARGE bills an ad-hoc one-time fee
// against an existing Fee type (set those up on Settings -> Fee types first).
export function BulkChargesImportPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="m-0 mb-1 font-display text-xl text-ink">Charges import</h1>
      <p className="m-0 mb-6 text-xs text-muted">
        Bulk-load one-time per-flat charges — pre-go-live arrears or ad-hoc fees — via CSV.
      </p>

      <CsvImportPanel<BulkChargesImportResult>
        title="Opening Balance & Other Charges"
        description={
          <>
            Required columns: wing, flatnumber, pool (MAINTENANCE_OPENING_BALANCE or
            OTHER_CHARGE), amount. feetypename is required when pool=OTHER_CHARGE (must
            already exist under Settings → Fee types). note is optional. A flat can only
            have one Opening Balance ever imported — re-importing one is reported as a row
            error, not a duplicate charge.
          </>
        }
        endpoint="/api/admin/bulk-charges/import"
        templateFilename="bulk-charges-import-template.csv"
        templateContent={CHARGES_CSV_TEMPLATE}
        renderSuccessMessage={(data) => `${data.imported} charge(s) imported.`}
      />
    </div>
  );
}
