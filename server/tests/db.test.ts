import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/infrastructure/prisma/client';

describe('database connection', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to postgres', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result).toEqual([{ ok: 1 }]);
  });
});
