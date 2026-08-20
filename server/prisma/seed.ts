import bcrypt from 'bcrypt';
import { prisma } from '../src/infrastructure/prisma/client';
import {
  generateMaintenanceRecords,
  previousPeriod,
} from '../src/features/maintenance/maintenance-record.service';

export const SEED_SOCIETY_NAME = 'Sunrise Residency';
export const SEED_DEFAULT_PASSWORD = 'password123';

// Maintenance-record backfill range (added 2026-08-06, so the seeded demo shows real
// data for all three roles — an empty Passbook/admin dues table is a poor demo).
// Starts at January 2026 to match the earliest seeded OccupancyChange (B-201's Frank,
// Jan 1) and runs through previousPeriod() — the same arrears-billing default
// generateMaintenanceRecords itself now uses, so this never generates a period the
// live cron wouldn't also consider "already due" (see CLAUDE.md's 2026-08-06 addendum).
const BACKFILL_START_PERIOD = '2026-01';

function enumeratePeriods(startPeriod: string, endPeriod: string): string[] {
  const [startYear, startMonth] = startPeriod.split('-').map(Number);
  const [endYear, endMonth] = endPeriod.split('-').map(Number);
  const periods: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods;
}

// Idempotent (generateMaintenanceRecords already is, per flat+period; the deposit
// backfill below skips a flat that already has one) — safe to call every time the seed
// script runs, not just on first creation. Every period generates a SYSTEM charge
// (MaintenanceRecord — always implicitly "Approved" under the ledger model, see
// CLAUDE.md's ledger pivot note). All periods except the most recent are then "settled"
// by one synthetic APPROVED Deposit LedgerEntry per flat, covering their combined
// amount — not a real payment audit trail, so there's no QR/proof-upload flow to go
// through — so the Passbook/admin views show a believable mix of settled history plus
// one currently outstanding (Payable > 0) period, rather than every charge outstanding.
async function backfillMaintenanceRecords(societyId: string) {
  const endPeriod = previousPeriod();
  const periods = enumeratePeriods(BACKFILL_START_PERIOD, endPeriod);

  let created = 0;
  for (const period of periods) {
    const result = await generateMaintenanceRecords(societyId, period);
    created += result.created;
  }

  const historicalPeriods = periods.slice(0, -1);
  let depositsCreated = 0;
  if (historicalPeriods.length > 0) {
    const flats = await prisma.flat.findMany({ where: { societyId } });
    for (const flat of flats) {
      const alreadyBackfilled = await prisma.ledgerEntry.findFirst({
        where: { flatId: flat.id },
      });
      if (alreadyBackfilled) continue;

      const historicalRecords = await prisma.maintenanceRecord.findMany({
        where: { flatId: flat.id, period: { in: historicalPeriods } },
      });
      const amount = historicalRecords.reduce((sum, r) => sum + Number(r.amount), 0);
      if (amount <= 0) continue;

      const payerId = flat.currentTenantId ?? flat.ownerId;
      await prisma.ledgerEntry.create({
        data: {
          flatId: flat.id,
          status: 'APPROVED',
          amount,
          note: `UPI payment — covers ${historicalPeriods[0]} to ${historicalPeriods[historicalPeriods.length - 1]}`,
          payerId,
          reviewedAt: new Date(),
          createdById: payerId,
          createdByType: flat.currentTenantId ? 'TENANT' : 'OWNER',
        },
      });
      depositsCreated += 1;
    }
  }

  console.log(
    `Backfilled maintenance records for ${SEED_SOCIETY_NAME}: ${created} created across ` +
      `${periods[0]}..${periods[periods.length - 1]} (${depositsCreated} approved backfill deposit(s) created ` +
      `covering ${historicalPeriods.length} historical period(s); ${periods[periods.length - 1]} left ` +
      `outstanding as the current due).`,
  );
}

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

export async function main() {
  const existing = await prisma.society.findFirst({ where: { name: SEED_SOCIETY_NAME } });
  if (existing) {
    console.log(
      `Seed data already exists for "${SEED_SOCIETY_NAME}", skipping user/flat creation.`,
    );
    await backfillMaintenanceRecords(existing.id);
    return { society: existing, skipped: true };
  }

  const passwordHash = await hash(SEED_DEFAULT_PASSWORD);

  const society = await prisma.society.create({
    data: {
      name: SEED_SOCIETY_NAME,
      address: '1 Garden Road, Pune',
      upiVpa: 'sunrise-residency@okhdfcbank',
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@sunrise.test',
      passwordHash,
      role: 'ADMIN',
      societyId: society.id,
    },
  });

  const owners = await Promise.all(
    [
      { name: 'Alice Owner', email: 'alice@sunrise.test' },
      { name: 'Bob Owner', email: 'bob@sunrise.test' },
      { name: 'Carol Owner', email: 'carol@sunrise.test' },
      { name: 'Eve Owner', email: 'eve@sunrise.test' },
      { name: 'Heidi Owner', email: 'heidi@sunrise.test' },
    ].map((u) =>
      prisma.user.create({
        data: { ...u, passwordHash, role: 'OWNER', societyId: society.id },
      }),
    ),
  );
  const [alice, bob, carol, eve, heidi] = owners;

  const tenants = await Promise.all(
    [
      { name: 'Dave Tenant', email: 'dave@sunrise.test' },
      { name: 'Frank Tenant', email: 'frank@sunrise.test' },
      { name: 'Grace Tenant', email: 'grace@sunrise.test' },
      { name: 'Ivan Tenant', email: 'ivan@sunrise.test' },
    ].map((u) =>
      prisma.user.create({
        data: { ...u, passwordHash, role: 'TENANT', societyId: society.id },
      }),
    ),
  );
  const [dave, frank, grace, ivan] = tenants;

  // A-101 and A-102: owner-occupied, never had a tenant.
  await prisma.flat.create({
    data: {
      wing: 'A',
      flatNumber: '101',
      baseRate: 1500,
      societyId: society.id,
      ownerId: alice.id,
    },
  });
  await prisma.flat.create({
    data: { wing: 'A', flatNumber: '102', baseRate: 1600, societyId: society.id, ownerId: bob.id },
  });

  // A-103: currently tenant-occupied, single ongoing tenancy (no prior tenant).
  const a103 = await prisma.flat.create({
    data: {
      wing: 'A',
      flatNumber: '103',
      baseRate: 1400,
      societyId: society.id,
      ownerId: carol.id,
      currentTenantId: dave.id,
    },
  });
  await prisma.occupancyChange.create({
    data: {
      flatId: a103.id,
      tenantId: dave.id,
      effectiveStart: new Date('2026-05-01'),
      effectiveEnd: null,
    },
  });

  // B-201: mid-history — Frank occupied and moved out, Grace is the current tenant.
  const b201 = await prisma.flat.create({
    data: {
      wing: 'B',
      flatNumber: '201',
      baseRate: 1800,
      societyId: society.id,
      ownerId: eve.id,
      currentTenantId: grace.id,
    },
  });
  await prisma.occupancyChange.create({
    data: {
      flatId: b201.id,
      tenantId: frank.id,
      effectiveStart: new Date('2026-01-01'),
      effectiveEnd: new Date('2026-04-30'),
    },
  });
  await prisma.occupancyChange.create({
    data: {
      flatId: b201.id,
      tenantId: grace.id,
      effectiveStart: new Date('2026-05-01'),
      effectiveEnd: null,
    },
  });

  // B-202: had a tenant (Ivan) who moved out — currently reverted to owner-occupied.
  const b202 = await prisma.flat.create({
    data: {
      wing: 'B',
      flatNumber: '202',
      baseRate: 1550,
      societyId: society.id,
      ownerId: heidi.id,
      currentTenantId: null,
    },
  });
  await prisma.occupancyChange.create({
    data: {
      flatId: b202.id,
      tenantId: ivan.id,
      effectiveStart: new Date('2026-02-01'),
      effectiveEnd: new Date('2026-04-15'),
    },
  });

  console.log(`Seeded society "${society.name}" with 1 admin, 5 owners, 4 tenants, 5 flats.`);
  await backfillMaintenanceRecords(society.id);
  return { society, admin, skipped: false };
}

if (require.main === module) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
