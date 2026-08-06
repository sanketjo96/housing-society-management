import { randomBytes } from 'crypto';
import type { Role } from '../generated/prisma/client';
import { prisma } from '../db';
import { DuplicateFieldError } from '../lib/errors';
import { getUniqueConstraintFields } from '../lib/prisma-errors';
import { scopedWhere } from '../lib/tenant-scope';
import { createUser } from './admin-users.service';
import { requestPasswordReset } from './password-reset.service';

// Thrown when tenantId doesn't resolve to a TENANT-role user within the caller's own
// society — covers "id doesn't exist," "id belongs to a different society" (tenant
// scoping — Task 2.6), and "id exists but isn't a TENANT" with one error, since none
// of those are the client's business to distinguish. Only used by the id-based
// assignTenant (Task 3.2) — createFlat/updateFlat (redesigned, see CLAUDE.md's
// "Addition (2026-08-06)") take owner/tenant contact fields instead of ids.
export class InvalidTenantError extends Error {
  constructor() {
    super('tenantId must reference an existing TENANT in this society');
    this.name = 'InvalidTenantError';
  }
}

// Thrown when an email supplied for an owner/tenant contact field already belongs to a
// User in this society, but under a different role — e.g. onboarding someone as a flat
// owner whose email is already registered as a TENANT (or ADMIN) elsewhere. One email
// can't wear two roles in this schema, so this is a real conflict, not silently
// resolvable by picking one.
export class ConflictingRoleError extends Error {
  constructor(email: string, expectedRole: Role, actualRole: Role) {
    super(`${email} already exists as ${actualRole} in this society, cannot also be ${expectedRole}`);
    this.name = 'ConflictingRoleError';
  }
}

// Assigning a tenant to a flat that already has one is rejected rather than silently
// swapped — closing the existing OccupancyChange row is a real state change the caller
// didn't explicitly ask for. removeTenant must be called first (see docs/flats.md).
export class TenantAlreadyAssignedError extends Error {
  constructor() {
    super('Flat already has a current tenant — remove them before assigning a new one');
    this.name = 'TenantAlreadyAssignedError';
  }
}

export class NoCurrentTenantError extends Error {
  constructor() {
    super('Flat has no current tenant to remove');
    this.name = 'NoCurrentTenantError';
  }
}

interface ContactFields {
  name: string;
  phone?: string;
  email: string;
}

export interface CreateFlatInput {
  societyId: string;
  block: string;
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

const FLAT_WITH_RESIDENTS_INCLUDE = {
  owner: { select: { id: true, name: true, email: true, phone: true } },
  currentTenant: { select: { id: true, name: true, email: true, phone: true } },
} as const;

async function userExistsWithRole(societyId: string, userId: string, role: Role): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: scopedWhere(societyId, { id: userId, role }),
    select: { id: true },
  });
  return !!user;
}

// Finds an existing User by email within this society (globally-unique email, but
// scoped-lookup keeps this consistent with every other tenant-scoping check in this
// file) and updates their name/phone in place; creates a new one — random unusable
// password, then the same password-reset mechanism Task 2.4 built (docs/auth.md) — if
// none exists yet. Shared by createFlat/updateFlat for both owner and tenant contact
// fields (CLAUDE.md's "Addition (2026-08-06)": onboarding a flat is one atomic action,
// not "create the account, then separately create the flat").
async function findOrCreateUserByEmail(societyId: string, role: Role, contact: ContactFields) {
  const existing = await prisma.user.findFirst({ where: scopedWhere(societyId, { email: contact.email }) });
  if (existing) {
    if (existing.role !== role) throw new ConflictingRoleError(contact.email, role, existing.role);
    return prisma.user.update({ where: { id: existing.id }, data: { name: contact.name, phone: contact.phone } });
  }

  const created = await createUser({
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    password: randomBytes(24).toString('hex'),
    role,
    societyId,
  });
  await requestPasswordReset(created.email);
  return created;
}

// Shared by createFlat and updateFlat: applies the occupancy/tenant portion of a flat
// form save. 'tenant' with tenant contact fields upserts (create-or-update-in-place,
// never rejects an existing tenant the way the id-based assignTenant/Task 3.2 does —
// this backs a single "Save" button over one form, occupancy + tenant fields together).
// 'owner' closes any existing open OccupancyChange, reverting to owner-occupied.
async function applyOccupancy(
  flatId: string,
  societyId: string,
  occupancy: 'owner' | 'tenant' | undefined,
  tenant: { name?: string; phone?: string; email?: string; effectiveFrom?: Date },
) {
  const openOccupancy = await prisma.occupancyChange.findFirst({ where: { flatId, effectiveEnd: null } });

  if (occupancy === 'tenant' && tenant.email) {
    if (openOccupancy) {
      await prisma.user.update({
        where: { id: openOccupancy.tenantId },
        data: { name: tenant.name, phone: tenant.phone, email: tenant.email },
      });
      if (tenant.effectiveFrom) {
        await prisma.occupancyChange.update({
          where: { id: openOccupancy.id },
          data: { effectiveStart: tenant.effectiveFrom },
        });
      }
    } else {
      const tenantUser = await findOrCreateUserByEmail(societyId, 'TENANT', {
        name: tenant.name ?? '',
        phone: tenant.phone,
        email: tenant.email,
      });
      await prisma.$transaction([
        prisma.occupancyChange.create({
          data: {
            flatId,
            tenantId: tenantUser.id,
            effectiveStart: tenant.effectiveFrom ?? new Date(),
            effectiveEnd: null,
          },
        }),
        prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: tenantUser.id } }),
      ]);
    }
  } else if (occupancy === 'owner' && openOccupancy) {
    await prisma.$transaction([
      prisma.occupancyChange.update({ where: { id: openOccupancy.id }, data: { effectiveEnd: new Date() } }),
      prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: null } }),
    ]);
  }
}

// Scoped to the caller's own society (Task 2.6), same as admin-users.service.ts's
// getUserById — a flat id from a different society returns null, indistinguishable
// from an id that doesn't exist at all.
async function getFlatById(id: string, societyId: string) {
  return prisma.flat.findFirst({ where: scopedWhere(societyId, { id }) });
}

// Includes owner/currentTenant contact summaries in one query — Task 3.3's list view
// is exactly "flat list view with owner/tenant/status" (Epic 2), so the admin
// shouldn't need N+1 follow-up requests per row.
export async function listFlats(societyId: string) {
  return prisma.flat.findMany({
    where: { societyId },
    orderBy: [{ block: 'asc' }, { flatNumber: 'asc' }],
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
}

// One atomic action: find-or-create the owner's account, create the flat, and (if
// occupancy is 'tenant') find-or-create the tenant's account and open their
// OccupancyChange — matching the admin UI's single flat-onboarding form (block,
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
        block: input.block,
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
// tell a wrong-society id apart from a nonexistent one. block/flatNumber are
// deliberately not editable here (matches the admin UI's disabled inputs — the
// onboarding-time identity of a flat doesn't change; see CLAUDE.md's
// "Addition (2026-08-06)").
export async function updateFlat(id: string, societyId: string, input: UpdateFlatInput) {
  const existing = await prisma.flat.findFirst({ where: scopedWhere(societyId, { id } ) });
  if (!existing) return null;

  if (input.ownerName !== undefined || input.ownerPhone !== undefined || input.ownerEmail !== undefined) {
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

const IMPORT_REQUIRED_COLUMNS = ['block', 'flatnumber', 'baserate', 'ownername', 'owneremail'];
const IMPORT_OPTIONAL_COLUMNS = [
  'ownerphone',
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
export async function bulkImportFlats(societyId: string, csvText: string): Promise<BulkImportResult> {
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
    return { created: [], errors: [{ row: 0, message: `Missing required column(s): ${missing.join(', ')}` }] };
  }

  const colIndex = Object.fromEntries(
    [...IMPORT_REQUIRED_COLUMNS, ...IMPORT_OPTIONAL_COLUMNS].map((col) => [col, header.indexOf(col)]),
  );
  const cell = (cols: string[], col: string) => (colIndex[col] === -1 ? undefined : cols[colIndex[col]] || undefined);

  const created: BulkImportResult['created'] = [];
  const errors: BulkImportRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-indexed including the header row, matching what a spreadsheet shows
    const cols = lines[i].split(',').map((c) => c.trim());
    const block = cell(cols, 'block');
    const flatNumber = cell(cols, 'flatnumber');
    const baseRateRaw = cell(cols, 'baserate');
    const ownerName = cell(cols, 'ownername');
    const ownerEmail = cell(cols, 'owneremail');

    if (!block || !flatNumber || !baseRateRaw || !ownerName || !ownerEmail) {
      errors.push({ row: rowNumber, message: 'Missing required value(s)' });
      continue;
    }

    const baseRate = Number(baseRateRaw);
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
      errors.push({ row: rowNumber, message: `Invalid baseRate "${baseRateRaw}"` });
      continue;
    }

    const occupancyRaw = cell(cols, 'occupancy')?.toLowerCase();
    const occupancy = occupancyRaw === 'tenant' ? 'tenant' : 'owner';
    const effectiveFromRaw = cell(cols, 'effectivefrom');

    try {
      const flat = await createFlat({
        societyId,
        block,
        flatNumber,
        baseRate,
        ownerName,
        ownerPhone: cell(cols, 'ownerphone'),
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
        errors.push({ row: rowNumber, message: `${block}-${flatNumber} already exists in this society` });
      } else if (err instanceof ConflictingRoleError) {
        errors.push({ row: rowNumber, message: err.message });
      } else {
        throw err;
      }
    }
  }

  return { created, errors };
}

// Opens a new OccupancyChange row (effectiveStart = now, effectiveEnd = null) and
// syncs Flat.currentTenantId in one transaction (docs/data-model.md's "Assigning a
// tenant creates a new OccupancyChange row"). Returns null for a nonexistent or
// wrong-society flat id (Task 2.6 tenant scoping), same as updateFlat.
export async function assignTenant(flatId: string, societyId: string, tenantId: string) {
  const flat = await getFlatById(flatId, societyId);
  if (!flat) return null;

  if (!(await userExistsWithRole(societyId, tenantId, 'TENANT'))) throw new InvalidTenantError();

  const openOccupancy = await prisma.occupancyChange.findFirst({
    where: { flatId, effectiveEnd: null },
    select: { id: true },
  });
  if (openOccupancy) throw new TenantAlreadyAssignedError();

  const now = new Date();
  const [, updatedFlat] = await prisma.$transaction([
    prisma.occupancyChange.create({ data: { flatId, tenantId, effectiveStart: now, effectiveEnd: null } }),
    prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: tenantId } }),
  ]);
  return updatedFlat;
}

// Closes the existing open OccupancyChange row (sets effectiveEnd = now) and syncs
// Flat.currentTenantId back to null in one transaction (docs/data-model.md's "Removing
// a tenant closes the existing open row — it does not create a new row"). Returns null
// for a nonexistent or wrong-society flat id, same as assignTenant/updateFlat.
export async function removeTenant(flatId: string, societyId: string) {
  const flat = await getFlatById(flatId, societyId);
  if (!flat) return null;

  const openOccupancy = await prisma.occupancyChange.findFirst({ where: { flatId, effectiveEnd: null } });
  if (!openOccupancy) throw new NoCurrentTenantError();

  const now = new Date();
  const [, updatedFlat] = await prisma.$transaction([
    prisma.occupancyChange.update({ where: { id: openOccupancy.id }, data: { effectiveEnd: now } }),
    prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: null } }),
  ]);
  return updatedFlat;
}

// --- Resident self-service (CLAUDE.md's "Addition (2026-08-06)") ---
// Ownership-scoped, not admin-role-scoped: distinct from assignTenant/removeTenant
// above, which stay admin-only and unchanged. These functions are reached from a
// separate route file (src/routes/me.route.ts) whose handlers pass req.user.id as
// the owner/tenant identity, never a role check alone.

// A resident's "my flat" view: for an OWNER, the flat they own; for a TENANT, the
// flat they currently occupy. This MVP assumes at most one such flat per resident
// (matches the shared UI mockup, which has a single hardcoded flat per session) —
// if a User somehow owns more than one Flat, this returns the earliest-created one,
// not an error; multi-flat ownership isn't a modeled concept anywhere else in the app.
export async function getMyFlat(userId: string, societyId: string, role: 'OWNER' | 'TENANT') {
  const flat = await prisma.flat.findFirst({
    where: scopedWhere(societyId, role === 'OWNER' ? { ownerId: userId } : { currentTenantId: userId }),
    orderBy: { createdAt: 'asc' },
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
  if (!flat) return null;

  const occupancy = flat.currentTenantId
    ? await prisma.occupancyChange.findFirst({ where: { flatId: flat.id, effectiveEnd: null } })
    : null;

  return { ...flat, occupancyEffectiveFrom: occupancy?.effectiveStart ?? null };
}

// Scoped to req.user.id === flat.ownerId, not requireRole(['ADMIN']) — an owner acting
// on their own flat, not an admin acting on any flat. Returns null (→ 404) for a flat
// that doesn't exist, belongs to a different society, or isn't the caller's own —
// same non-enumeration reasoning as every other scoping check in this file.
async function getOwnFlat(flatId: string, societyId: string, ownerId: string) {
  return prisma.flat.findFirst({ where: scopedWhere(societyId, { id: flatId, ownerId }) });
}

export interface UpsertOwnTenantInput {
  name: string;
  phone?: string;
  email: string;
  effectiveFrom?: Date;
}

// Deliberately diverges from assignTenant's behavior: where the admin endpoint throws
// TenantAlreadyAssignedError and requires an explicit removeTenant first, this updates
// the existing tenant's contact info in place when the flat already has one — matches
// the resident UI's single "Save changes" button over one form (occupancy toggle +
// tenant fields together), not a two-step admin workflow. See CLAUDE.md's "Addition
// (2026-08-06)" for the full reasoning.
export async function upsertOwnTenant(flatId: string, societyId: string, ownerId: string, input: UpsertOwnTenantInput) {
  const flat = await getOwnFlat(flatId, societyId, ownerId);
  if (!flat) return null;

  const openOccupancy = await prisma.occupancyChange.findFirst({ where: { flatId, effectiveEnd: null } });

  if (openOccupancy) {
    try {
      await prisma.user.update({
        where: { id: openOccupancy.tenantId },
        data: { name: input.name, phone: input.phone, email: input.email },
      });
    } catch (err) {
      const fields = getUniqueConstraintFields(err);
      if (fields) throw new DuplicateFieldError(fields);
      throw err;
    }
    if (input.effectiveFrom) {
      await prisma.occupancyChange.update({
        where: { id: openOccupancy.id },
        data: { effectiveStart: input.effectiveFrom },
      });
    }
  } else {
    // No password field is ever collected from the owner — a real, login-capable
    // TENANT is created with a random unusable password, then handed the same
    // password-reset mechanism Task 2.4 already built (docs/auth.md) so they can set
    // their own real password. createUser throws DuplicateFieldError itself if the
    // email's already in use — deliberately not caught here, so it propagates as-is.
    const tenant = await createUser({
      name: input.name,
      phone: input.phone,
      email: input.email,
      password: randomBytes(24).toString('hex'),
      role: 'TENANT',
      societyId,
    });
    await requestPasswordReset(tenant.email);

    await prisma.$transaction([
      prisma.occupancyChange.create({
        data: { flatId, tenantId: tenant.id, effectiveStart: input.effectiveFrom ?? new Date(), effectiveEnd: null },
      }),
      prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: tenant.id } }),
    ]);
  }

  return prisma.flat.findFirst({
    where: scopedWhere(societyId, { id: flatId, ownerId }),
    include: FLAT_WITH_RESIDENTS_INCLUDE,
  });
}

// Same underlying mechanism as removeTenant, ownership-scoped instead of role-scoped.
export async function removeOwnTenant(flatId: string, societyId: string, ownerId: string) {
  const flat = await getOwnFlat(flatId, societyId, ownerId);
  if (!flat) return null;

  const openOccupancy = await prisma.occupancyChange.findFirst({ where: { flatId, effectiveEnd: null } });
  if (!openOccupancy) throw new NoCurrentTenantError();

  const now = new Date();
  const [, updatedFlat] = await prisma.$transaction([
    prisma.occupancyChange.update({ where: { id: openOccupancy.id }, data: { effectiveEnd: now } }),
    prisma.flat.update({ where: { id: flatId }, data: { currentTenantId: null } }),
  ]);
  return updatedFlat;
}
