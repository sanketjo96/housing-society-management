import { CsvImportPanel } from '../../components/CsvImportPanel';

interface BulkChargesImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

const CHARGES_CSV_TEMPLATE =
  'wing,flatnumber,pool,feetypename,amount,note\n' +
  'A,101,MAINTENANCE_OPENING_BALANCE,,45000,Legacy arrears as of go-live\n' +
  'A,101,OTHER_CHARGE,Water Connection,1500,\n';

// Matches each CSV row to a flat by wing+flatNumber, then branches on `pool`:
// MAINTENANCE_OPENING_BALANCE (one-time pre-go-live arrears) or OTHER_CHARGE
// (ad-hoc fee against an existing Custom Fee).
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
            already exist under Settings → Custom Fees). note is optional. A flat can only
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
