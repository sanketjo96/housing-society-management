// Admin flat onboarding/CRUD: list, create, update, CSV bulk-import.
// assignTenant/removeTenant (id-based) live in ./admin-flats-tenancy-service.ts.
import { prisma } from '../../../infrastructure/prisma/client';
import { DuplicateFieldError } from '../../../shared/errors/errors';
import { getUniqueConstraintFields } from '../../../shared/errors/prisma-errors';
import { scopedWhere } from '../../../shared/security/tenant-scope';
import {
  applyOccupancy,
  ConflictingRoleError,
  findOrCreateUserByEmail,
  FLAT_WITH_RESIDENTS_INCLUDE,
} from '../flat-shared';

export { ConflictingRoleError };

export interface CreateFlatInput {
  societyId: string;
  wing: string;
  flatNumber: string;
  baseRate: number;
  ownerName: string;
  ownerPhone?: string;
  ownerEmail: string;
  occupancy?: 'owner' | 'tenant';
  tenantName?: string;
  tenantPhone?: string;
  tenantEmail?: string;
  effectiveFrom?: Date;
}

export interface UpdateFlatInput {
  baseRate?: number;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  occupancy?: 'owner' | 'tenant';
  tenantName?: string;
  tenantPhone?: string;
  tenantEmail?: string;
  effectiveFrom?: Date;
}

// Includes owner/currentTenant contact summaries in one query, avoiding N+1.
export async function listFlats(societyId: string) {
  return prisma.flat.findMany({
    where: { societyId },
    orderBy: [{ wing: 'asc' }, { flatNumber: 'asc' }],
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
}

// Finds-or-creates the owner's account, creates the flat, and (if occupancy is
// 'tenant') finds-or-creates the tenant's account and opens their OccupancyChange.
export async function createFlat(input: CreateFlatInput) {
  const owner = await findOrCreateUserByEmail(input.societyId, 'OWNER', {
    name: input.ownerName,
    phone: input.ownerPhone,
    email: input.ownerEmail,
  });

  let flat;
  try {
    flat = await prisma.flat.create({
      data: {
        wing: input.wing,
        flatNumber: input.flatNumber,
        baseRate: input.baseRate,
        societyId: input.societyId,
        ownerId: owner.id,
      },
    });
  } catch (err) {
    const fields = getUniqueConstraintFields(err);
    if (fields) throw new DuplicateFieldError(fields.filter((f) => f !== 'societyId'));
    throw err;
  }

  await applyOccupancy(flat.id, input.societyId, input.occupancy, {
    name: input.tenantName,
    phone: input.tenantPhone,
    email: input.tenantEmail,
    effectiveFrom: input.effectiveFrom,
  });

  return prisma.flat.findFirst({
    where: { id: flat.id },
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
}

// Returns null for a nonexistent flat or one in a different society. wing/flatNumber
// are not editable here — set once at onboarding.
export async function updateFlat(id: string, societyId: string, input: UpdateFlatInput) {
  const existing = await prisma.flat.findFirst({ where: scopedWhere(societyId, { id }) });
  if (!existing) return null;

  if (
    input.ownerName !== undefined ||
    input.ownerPhone !== undefined ||
    input.ownerEmail !== undefined
  ) {
    try {
      await prisma.user.update({
        where: { id: existing.ownerId },
        data: { name: input.ownerName, phone: input.ownerPhone, email: input.ownerEmail },
      });
    } catch (err) {
      const fields = getUniqueConstraintFields(err);
      if (fields) throw new DuplicateFieldError(fields);
      throw err;
    }
  }

  if (input.baseRate !== undefined) {
    await prisma.flat.update({ where: { id }, data: { baseRate: input.baseRate } });
  }

  if (input.occupancy !== undefined) {
    await applyOccupancy(id, societyId, input.occupancy, {
      name: input.tenantName,
      phone: input.tenantPhone,
      email: input.tenantEmail,
      effectiveFrom: input.effectiveFrom,
    });
  }

  return prisma.flat.findFirst({
    where: { id },
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
}

export interface BulkImportRowError {
  row: number;
  message: string;
}

export interface BulkImportResult {
  created: Awaited<ReturnType<typeof createFlat>>[];
  errors: BulkImportRowError[];
}

const IMPORT_REQUIRED_COLUMNS = ['wing', 'flatnumber', 'ownername', 'ownerphone', 'owneremail'];
const IMPORT_OPTIONAL_COLUMNS = [
  'occupancy',
  'tenantname',
  'tenantphone',
  'tenantemail',
  'effectivefrom',
] as const;

// Hand-rolled, column-name-based CSV parsing (no library) — works with reordered
// columns. Per-row failures are collected; the batch continues.
export async function bulkImportFlats(
  societyId: string,
  csvText: string,
): Promise<BulkImportResult> {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { created: [], errors: [{ row: 0, message: 'CSV is empty' }] };
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const missing = IMPORT_REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return {
      created: [],
      errors: [{ row: 0, message: `Missing required column(s): ${missing.join(', ')}` }],
    };
  }

  const colIndex = Object.fromEntries(
    [...IMPORT_REQUIRED_COLUMNS, ...IMPORT_OPTIONAL_COLUMNS].map((col) => [
      col,
      header.indexOf(col),
    ]),
  );
  const cell = (cols: string[], col: string) =>
    colIndex[col] === -1 ? undefined : cols[colIndex[col]] || undefined;

  // Every imported row takes the society's default base rate — adjustable afterward
  // per flat.
  const society = await prisma.society.findUniqueOrThrow({ where: { id: societyId } });

  const created: BulkImportResult['created'] = [];
  const errors: BulkImportRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-indexed including the header row, matching what a spreadsheet shows
    const cols = lines[i].split(',').map((c) => c.trim());
    const wing = cell(cols, 'wing');
    const flatNumber = cell(cols, 'flatnumber');
    const ownerName = cell(cols, 'ownername');
    const ownerPhone = cell(cols, 'ownerphone');
    const ownerEmail = cell(cols, 'owneremail');

    if (!wing || !flatNumber || !ownerName || !ownerPhone || !ownerEmail) {
      errors.push({ row: rowNumber, message: 'Missing required value(s)' });
      continue;
    }

    const baseRate = Number(society.defaultBaseRate);
    const occupancyRaw = cell(cols, 'occupancy')?.toLowerCase();
    const occupancy = occupancyRaw === 'tenant' ? 'tenant' : 'owner';
    const effectiveFromRaw = cell(cols, 'effectivefrom');

    try {
      const flat = await createFlat({
        societyId,
        wing,
        flatNumber,
        baseRate,
        ownerName,
        ownerPhone,
        ownerEmail,
        occupancy,
        tenantName: cell(cols, 'tenantname'),
        tenantPhone: cell(cols, 'tenantphone'),
        tenantEmail: cell(cols, 'tenantemail'),
        effectiveFrom: effectiveFromRaw ? new Date(effectiveFromRaw) : undefined,
      });
      created.push(flat);
    } catch (err) {
      if (err instanceof DuplicateFieldError) {
        errors.push({
          row: rowNumber,
          message: `${wing}-${flatNumber} already exists in this society`,
        });
      } else if (err instanceof ConflictingRoleError) {
        errors.push({ row: rowNumber, message: err.message });
      } else {
        throw err;
      }
    }
  }

  return { created, errors };
}
