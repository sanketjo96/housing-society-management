import { CsvImportPanel } from '../../components/CsvImportPanel';

interface FinanceHistoryImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

const FINANCE_HISTORY_CSV_TEMPLATE =
  'direction,categoryname,amount,transactiondate,paymentmethod,bankreference,note\n' +
  'EXPENSE,Electricity,4200,2024-03-15,CASH,,\n' +
  'INCOME,Bank Interest,850,2024-03-31,BANK_TRANSFER,INTT-2024-0331,\n';

// The "Finance" child page under the "Imports" submenu (DashboardLayout.tsx) — Phase
// E of docs/society-onboarding/. A dedicated page rather than an inline panel on
// ManageFinancePage.tsx (the original architecture sketch), so every onboarding
// import lives in one place under /imports/*. Each category must already exist
// under Settings -> Finance categories before importing. No proof file is required
// or accepted here — legacy rows have no scanned receipt to attach retroactively —
// each imported row's note is auto-appended with a marker flagging it as
// historical/unverified, same as the backend does.
export function FinanceHistoryImportPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="m-0 mb-1 font-display text-xl text-ink">Finance history import</h1>
      <p className="m-0 mb-6 text-xs text-muted">
        Bulk-load historical society income/expense transactions into Manage Finance via CSV.
      </p>

      <CsvImportPanel<FinanceHistoryImportResult>
        title="Historical income & expense"
        description={
          <>
            Required columns: direction (INCOME or EXPENSE), categoryname (must already exist
            under Settings → Finance categories), amount, transactiondate,
            paymentmethod (CASH, BANK_TRANSFER, UPI, CHEQUE, or OTHER). bankreference is
            required unless paymentmethod is CASH. note is optional. No proof file is
            accepted here — every imported row is marked as historical in its note.
          </>
        }
        endpoint="/api/admin/society-ledger/import"
        templateFilename="finance-history-import-template.csv"
        templateContent={FINANCE_HISTORY_CSV_TEMPLATE}
        invalidateQueryKeys={[['admin-society-ledger']]}
        renderSuccessMessage={(data) => `${data.imported} transaction(s) imported.`}
      />
    </div>
  );
}
