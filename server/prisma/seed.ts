import bcrypt from 'bcrypt';
import { prisma } from '../src/db';

export const SEED_SOCIETY_NAME = 'Sunrise Residency';
export const SEED_DEFAULT_PASSWORD = 'password123';

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

export async function main() {
  const existing = await prisma.society.findFirst({ where: { name: SEED_SOCIETY_NAME } });
  if (existing) {
    console.log(`Seed data already exists for "${SEED_SOCIETY_NAME}", skipping.`);
    return { society: existing, skipped: true };
  }

  const passwordHash = await hash(SEED_DEFAULT_PASSWORD);

  const society = await prisma.society.create({
    data: { name: SEED_SOCIETY_NAME, address: '1 Garden Road, Pune', upiVpa: 'sunrise-residency@okhdfcbank' },
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
    data: { wing: 'A', flatNumber: '101', baseRate: 1500, societyId: society.id, ownerId: alice.id },
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
    data: { flatId: a103.id, tenantId: dave.id, effectiveStart: new Date('2026-05-01'), effectiveEnd: null },
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
    data: { flatId: b201.id, tenantId: grace.id, effectiveStart: new Date('2026-05-01'), effectiveEnd: null },
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
