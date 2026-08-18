// Admin flat onboarding/CRUD: list, create, update, CSV bulk-import. Backs
// admin/controller.ts's non-tenant-assignment endpoints (assignTenant/removeTenant,
// the id-based lower-level alternative, live in ./tenancy.service.ts).
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

// Includes owner/currentTenant contact summaries in one query — Task 3.3's list view
// is exactly "flat list view with owner/tenant/status" (Epic 2), so the admin
// shouldn't need N+1 follow-up requests per row.
export async function listFlats(societyId: string) {
  return prisma.flat.findMany({
    where: { societyId },
    orderBy: [{ wing: 'asc' }, { flatNumber: 'asc' }],
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
}

// One atomic action: find-or-create the owner's account, create the flat, and (if
// occupancy is 'tenant') find-or-create the tenant's account and open their
// OccupancyChange — matching the admin UI's single flat-onboarding form (wing,
// flatNumber, baseRate, owner contact, occupancy, tenant contact all saved together).
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

// Returns null if the flat doesn't exist, or exists but belongs to a different society
// (Task 2.6 tenant scoping) — same "not found" outcome either way, so a caller can't
// tell a wrong-society id apart from a nonexistent one. wing/flatNumber are
// deliberately not editable here (matches the admin UI's disabled inputs — the
// onboarding-time identity of a flat doesn't change; see CLAUDE.md's
// "Addition (2026-08-06)").
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

// Hand-rolled CSV parsing (no library) — deliberately, since the expected fields never
// contain commas or quotes, so a dependency for RFC 4180 edge cases (quoted fields,
// embedded commas) isn't needed for this MVP's actual data (CLAUDE.md: "correctness
// over scale, don't over-engineer"). Column-name-based (not fixed-order) so a
// spreadsheet export with reordered columns still works. Per-row failures are
// collected rather than aborting the batch — one bad row (a typo'd occupancy value,
// non-numeric rate) shouldn't block every other valid row in the same import. Same
// owner/tenant contact-field shape as createFlat/updateFlat (CLAUDE.md's "Addition
// (2026-08-06)") — a CSV row onboards a flat exactly the way the admin form does.
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

  // A bulk-imported row always takes the society's configured default base rate — no
  // per-row baseRate column, unlike single-flat onboarding where an admin can set a
  // flat-specific rate. Keeps the CSV contract to identity/contact fields only; a rate
  // that needs to differ from the default can still be adjusted afterward via the
  // per-flat edit form.
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
