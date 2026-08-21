// Phase C of docs/society-onboarding/ — bulk-imports one-time per-flat charges from a
// CSV, branching per row on `pool`. Every row either creates a sentinel-period
// "Opening Balance" MaintenanceRecord (a one-time pre-go-live arrears figure) or
// reuses billOtherCharge's exact validation/creation contract for an ad-hoc one-time
// fee — never a parallel reimplementation of either rule set. Same
// per-row-error-collection, whole-batch-continues shape as bulkImportFlats
// (admin-flats-onboarding-service.ts), and the same hand-rolled column-name-based CSV
// parsing (no library — the expected fields never contain commas or quotes at this
// MVP's scale).
import { prisma } from '../../infrastructure/prisma/client';
import { getUniqueConstraintFields } from '../../shared/errors/prisma-errors';
import { scopedWhere } from '../../shared/security/tenant-scope';
import {
  billOtherCharge,
  FeeTypeNotBillableError,
  FlatNotFoundError,
  InvalidAmountError,
} from '../other-charges/other-charges.service';

// Sorts lexicographically before every real "YYYY-MM" period, so
// computeRecordSettlements' oldest-first FIFO fill (ledger-shared.ts) always settles
// this record before any real month's charge — with zero changes to that function.
// See docs/society-onboarding/02-architecture.md's Data Model section.
export const OPENING_BALANCE_PERIOD = '0000-01';

export interface BulkImportChargeRowError {
  row: number;
  message: string;
}

export interface BulkImportChargesResult {
  imported: number;
  errors: BulkImportChargeRowError[];
}

const REQUIRED_COLUMNS = ['wing', 'flatnumber', 'pool', 'amount'];
const OPTIONAL_COLUMNS = ['feetypename', 'note'] as const;

// MaintenanceRecord has no `note` column (docs/society-onboarding/02-architecture.md:
// "No changes to any existing model's shape") — an Opening Balance row's note goes
// into AuditLog instead, the same place every other financial action's context
// already lives, rather than adding a schema column just for this one import path.
async function importOpeningBalance(
  societyId: string,
  adminId: string,
  flat: { id: string; ownerId: string; wing: string; flatNumber: string },
  amount: number,
  note: string | undefined,
): Promise<{ error?: string }> {
  try {
    const record = await prisma.maintenanceRecord.create({
      data: {
        flatId: flat.id,
        period: OPENING_BALANCE_PERIOD,
        payerType: 'OWNER',
        payerId: flat.ownerId,
        amount,
        dueDate: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'IMPORT_OPENING_BALANCE',
        entityType: 'MaintenanceRecord',
        entityId: record.id,
        note: note
          ? `Opening Balance ${amount} imported for flat ${flat.wing}-${flat.flatNumber}: ${note}`
          : `Opening Balance ${amount} imported for flat ${flat.wing}-${flat.flatNumber}`,
      },
    });
    return {};
  } catch (err) {
    // @@unique([flatId, period]) makes a re-run a safe row-error, not a duplicate —
    // the same idempotency guarantee generateMaintenanceRecords already relies on.
    const fields = getUniqueConstraintFields(err);
    if (fields) {
      return { error: `Opening Balance already imported for flat ${flat.wing}-${flat.flatNumber}` };
    }
    throw err;
  }
}

async function importOtherCharge(
  societyId: string,
  adminId: string,
  flat: { id: string },
  feeTypeName: string,
  amount: number,
  note: string | undefined,
): Promise<{ error?: string }> {
  const feeType = await prisma.feeType.findFirst({
    where: { name: feeTypeName, societyId, isActive: true },
  });
  if (!feeType) {
    return { error: `Fee type "${feeTypeName}" not found or inactive` };
  }

  try {
    await billOtherCharge(societyId, adminId, { flatId: flat.id, feeTypeId: feeType.id, amount, note });
    return {};
  } catch (err) {
    if (
      err instanceof FlatNotFoundError ||
      err instanceof FeeTypeNotBillableError ||
      err instanceof InvalidAmountError
    ) {
      return { error: err.message };
    }
    throw err;
  }
}

export async function bulkImportCharges(
  societyId: string,
  adminId: string,
  csvText: string,
): Promise<BulkImportChargesResult> {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { imported: 0, errors: [{ row: 0, message: 'CSV is empty' }] };
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return {
      imported: 0,
      errors: [{ row: 0, message: `Missing required column(s): ${missing.join(', ')}` }],
    };
  }

  const colIndex = Object.fromEntries(
    [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((col) => [col, header.indexOf(col)]),
  );
  const cell = (cols: string[], col: string) =>
    colIndex[col] === -1 ? undefined : cols[colIndex[col]] || undefined;

  let imported = 0;
  const errors: BulkImportChargeRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-indexed including the header row, matching what a spreadsheet shows
    const cols = lines[i].split(',').map((c) => c.trim());
    const wing = cell(cols, 'wing');
    const flatNumber = cell(cols, 'flatnumber');
    const poolRaw = cell(cols, 'pool')?.toUpperCase();
    const amountRaw = cell(cols, 'amount');
    const note = cell(cols, 'note');

    if (!wing || !flatNumber || !poolRaw || !amountRaw) {
      errors.push({ row: rowNumber, message: 'Missing required value(s)' });
      continue;
    }

    if (poolRaw !== 'MAINTENANCE_OPENING_BALANCE' && poolRaw !== 'OTHER_CHARGE') {
      errors.push({ row: rowNumber, message: 'pool must be MAINTENANCE_OPENING_BALANCE or OTHER_CHARGE' });
      continue;
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ row: rowNumber, message: 'amount must be a positive number' });
      continue;
    }

    const flat = await prisma.flat.findFirst({
      where: scopedWhere(societyId, { wing, flatNumber }),
    });
    if (!flat) {
      errors.push({ row: rowNumber, message: `Flat ${wing}-${flatNumber} not found` });
      continue;
    }

    if (poolRaw === 'MAINTENANCE_OPENING_BALANCE') {
      const result = await importOpeningBalance(societyId, adminId, flat, amount, note);
      if (result.error) errors.push({ row: rowNumber, message: result.error });
      else imported += 1;
      continue;
    }

    const feeTypeName = cell(cols, 'feetypename');
    if (!feeTypeName) {
      errors.push({ row: rowNumber, message: 'feetypename is required when pool=OTHER_CHARGE' });
      continue;
    }
    const result = await importOtherCharge(societyId, adminId, flat, feeTypeName, amount, note);
    if (result.error) errors.push({ row: rowNumber, message: result.error });
    else imported += 1;
  }

  return { imported, errors };
}
