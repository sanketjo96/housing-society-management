import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';

describe('Society and User models', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `admin-${suffix}@example.com`;
  let societyId: string;
  let userId: string;

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (societyId) await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('creates a User with the correct role, scoped to a Society', async () => {
    const society = await prisma.society.create({
      data: {
        name: `Test Society ${suffix}`,
        address: '123 Test St',
        upiVpa: 'test-society@okhdfcbank',
      },
    });
    societyId = society.id;

    expect(society.upiVpa).toBe('test-society@okhdfcbank');
    expect(Number(society.tenantRateFactor)).toBe(1.5);

    const user = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        societyId: society.id,
      },
    });
    userId = user.id;

    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.role).toBe('ADMIN');
    expect(found?.societyId).toBe(society.id);
    expect(found?.email).toBe(email);
  });
});
