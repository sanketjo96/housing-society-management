// Phase E of docs/society-onboarding/ — bulk-imports historical society-level
// income/expense transactions into Manage Finance. Reuses (via
// assertValidSocietyLedgerEntry, extracted from society-ledger.service.ts) the exact
// same direction-matches-category and bank-reference-required-unless-cash checks
// recordSocietyLedgerEntry already enforces, so the bulk and single-row paths can
// never silently drift apart. Deliberately skips recordSocietyLedgerEntry's
// mandatory-file check (Confirmed Product Decision #4, docs/society-onboarding/
// 01-requirements.md) — legacy rows have no scanned receipt to attach retroactively
// — auto-appending a note that flags each imported row as historical/unverified
// instead, so it stays visibly distinct from a normal admin-entered row in every
// list view. Same hand-rolled CSV parsing / per-row-error-collection shape as
// bulkImportFlats and bulk-charges.service.ts.
import { prisma } from '../../infrastructure/prisma/client';
import type {
  SocietyLedgerDirection,
  SocietyLedgerPaymentMethod,
} from '../../infrastructure/prisma/generated/client';
import {
  assertValidSocietyLedgerEntry,
  CategoryDirectionMismatchError,
  FinanceCategoryNotUsableError,
  InvalidAmountError,
  MissingBankReferenceError,
} from './society-ledger.service';

export interface BulkImportLedgerRowError {
  row: number;
  message: string;
}

export interface BulkImportSocietyLedgerResult {
  imported: number;
  errors: BulkImportLedgerRowError[];
}

const IMPORTED_NOTE_SUFFIX = '[Imported from legacy records — no proof scan available]';

const REQUIRED_COLUMNS = ['direction', 'categoryname', 'amount', 'transactiondate', 'paymentmethod'];
const OPTIONAL_COLUMNS = ['bankreference', 'note'] as const;

const VALID_DIRECTIONS: SocietyLedgerDirection[] = ['INCOME', 'EXPENSE'];
const VALID_PAYMENT_METHODS: SocietyLedgerPaymentMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'CHEQUE',
  'OTHER',
];

export async function bulkImportSocietyLedgerEntries(
  societyId: string,
  adminId: string,
  csvText: string,
): Promise<BulkImportSocietyLedgerResult> {
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
  const errors: BulkImportLedgerRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-indexed including the header row, matching what a spreadsheet shows
    const cols = lines[i].split(',').map((c) => c.trim());
    const directionRaw = cell(cols, 'direction')?.toUpperCase();
    const categoryName = cell(cols, 'categoryname');
    const amountRaw = cell(cols, 'amount');
    const transactionDateRaw = cell(cols, 'transactiondate');
    const paymentMethodRaw = cell(cols, 'paymentmethod')?.toUpperCase();
    const bankReference = cell(cols, 'bankreference');
    const note = cell(cols, 'note');

    if (!directionRaw || !categoryName || !amountRaw || !transactionDateRaw || !paymentMethodRaw) {
      errors.push({ row: rowNumber, message: 'Missing required value(s)' });
      continue;
    }
    if (!VALID_DIRECTIONS.includes(directionRaw as SocietyLedgerDirection)) {
      errors.push({ row: rowNumber, message: 'direction must be INCOME or EXPENSE' });
      continue;
    }
    if (!VALID_PAYMENT_METHODS.includes(paymentMethodRaw as SocietyLedgerPaymentMethod)) {
      errors.push({
        row: rowNumber,
        message: 'paymentmethod must be one of CASH, BANK_TRANSFER, UPI, CHEQUE, OTHER',
      });
      continue;
    }
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) {
      errors.push({ row: rowNumber, message: 'amount must be a number' });
      continue;
    }
    const transactionDate = new Date(transactionDateRaw);
    if (Number.isNaN(transactionDate.getTime())) {
      errors.push({ row: rowNumber, message: 'transactiondate is not a valid date' });
      continue;
    }

    const direction = directionRaw as SocietyLedgerDirection;
    const paymentMethod = paymentMethodRaw as SocietyLedgerPaymentMethod;

    const category = await prisma.societyLedgerCategory.findFirst({
      where: { name: categoryName, societyId, isActive: true },
    });

    try {
      assertValidSocietyLedgerEntry(category, { amount, direction, paymentMethod, bankReference });
    } catch (err) {
      if (
        err instanceof FinanceCategoryNotUsableError ||
        err instanceof CategoryDirectionMismatchError ||
        err instanceof MissingBankReferenceError ||
        err instanceof InvalidAmountError
      ) {
        errors.push({ row: rowNumber, message: err.message });
        continue;
      }
      throw err;
    }

    const importedNote = note ? `${note} ${IMPORTED_NOTE_SUFFIX}` : IMPORTED_NOTE_SUFFIX;

    const entry = await prisma.societyLedgerEntry.create({
      data: {
        societyId,
        direction,
        categoryId: category.id,
        amount,
        transactionDate,
        paymentMethod,
        bankReference: bankReference?.trim() || undefined,
        note: importedNote,
        fileUrl: null,
        mimeType: null,
        recordedById: adminId,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'IMPORT_SOCIETY_LEDGER_ENTRY',
        entityType: 'SocietyLedgerEntry',
        entityId: entry.id,
        note: `${direction} ${amount} — ${categoryName} (imported)`,
      },
    });
    imported += 1;
  }

  return { imported, errors };
}
