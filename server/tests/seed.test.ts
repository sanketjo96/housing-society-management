import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { SEED_SOCIETY_NAME, main as runSeed } from '../prisma/seed';

describe('seed script', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Assertions here check "did seeding produce the expected baseline", not "is the
  // table pristine" — since Task 3.7/3.8, the seeded Sunrise Residency society is also
  // the one the live demo stack runs against, and residents legitimately editing their
  // own profile/tenant (exactly the features those tasks built) changes row counts and
  // even seeded values (e.g. an owner's own email) over time. seed.ts's idempotency
  // check is society-level (skip entirely if the society exists), so it never repairs
  // individual drifted rows — nor should it; that would silently discard real usage.
  // >= / presence checks tolerate that drift; exact-count checks did not and started
  // flaking the first time someone actually used the running app.
  it('creates the expected society, users, flats, and occupancy history', async () => {
    await runSeed();

    const society = await prisma.society.findFirstOrThrow({
      where: { name: SEED_SOCIETY_NAME },
    });

    const userCount = await prisma.user.count({ where: { societyId: society.id } });
    expect(userCount).toBeGreaterThanOrEqual(10); // 1 admin + 5 owners + 4 tenants, at least

    const flats = await prisma.flat.findMany({
      where: { societyId: society.id },
      include: { occupancyChanges: true },
    });
    expect(flats.length).toBeGreaterThanOrEqual(5);

    const a103 = flats.find((f) => f.block === 'A' && f.flatNumber === '103');
    const b201 = flats.find((f) => f.block === 'B' && f.flatNumber === '201');
    expect(a103).toBeDefined();
    expect(b201).toBeDefined();

    // B-201 is the seeded mid-history flat: 2 rows, one of them closed (a prior tenant
    // who moved out before the current one moved in) — this identity-based check
    // survives unrelated occupancy activity elsewhere in the society.
    expect(b201!.occupancyChanges.length).toBeGreaterThanOrEqual(2);
    expect(b201!.occupancyChanges.some((oc) => oc.effectiveEnd !== null)).toBe(true);
    expect(b201!.occupancyChanges.some((oc) => oc.effectiveEnd === null)).toBe(true);
  });

  it('is idempotent — running twice does not duplicate the seeded flats', async () => {
    const society = await prisma.society.findFirstOrThrow({
      where: { name: SEED_SOCIETY_NAME },
    });
    const before = await prisma.flat.count({ where: { societyId: society.id } });

    await runSeed();
    await runSeed();

    const after = await prisma.flat.count({ where: { societyId: society.id } });
    expect(after).toBe(before);
  });
});
