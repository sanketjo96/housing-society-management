import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createFinanceCategory } from '../../../src/features/finance-categories/finance-categories.service';
import { bulkImportSocietyLedgerEntries } from '../../../src/features/society-ledger/society-ledger-bulk-import-service';

describe('society-ledger bulk import service — bulkImportSocietyLedgerEntries', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminId: string;
  let incomeCategoryId: string;
  let incomeCategoryName: string;
  let expenseCategoryName: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: `Ledger Bulk Import Society ${suffix}`, address: '1 Test St' },
    });
    societyId = society.id;

    const admin = await prisma.user.create({
      data: {
        name: 'Ledger Import Admin',
        email: `ledger-import-admin-${suffix}@example.com`,
        passwordHash: 'x',
        role: 'ADMIN',
        societyId,
      },
    });
    adminId = admin.id;

    incomeCategoryName = `Bank Interest ${suffix}`;
    const incomeCategory = await createFinanceCategory(societyId, adminId, {
      name: incomeCategoryName,
      direction: 'INCOME',
    });
    incomeCategoryId = incomeCategory.id;

    expenseCategoryName = `Electricity ${suffix}`;
    await createFinanceCategory(societyId, adminId, {
      name: expenseCategoryName,
      direction: 'EXPENSE',
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.societyLedgerEntry.deleteMany({ where: { societyId } });
    await prisma.societyLedgerCategory.deleteMany({ where: { societyId } });
    await prisma.refreshToken.deleteMany({ where: { userId: adminId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
    await prisma.society.delete({ where: { id: societyId } });
  });

  it('imports a valid CASH income row with no file, appending a historical-import note', async () => {
    const csv =
      'direction,categoryname,amount,transactiondate,paymentmethod,note\n' +
      `INCOME,${incomeCategoryName},5000,2024-03-15,CASH,Interest credited`;
    const result = await bulkImportSocietyLedgerEntries(societyId, adminId, csv);

    expect(result.errors).toHaveLength(0);
    expect(result.imported).toBe(1);

    const entry = await prisma.societyLedgerEntry.findFirst({
      where: { societyId, categoryId: incomeCategoryId },
    });
    expect(entry).toBeTruthy();
    expect(Number(entry!.amount)).toBe(5000);
    expect(entry!.fileUrl).toBeNull();
    expect(entry!.mimeType).toBeNull();
    expect(entry!.note).toContain('Interest credited');
    expect(entry!.note).toContain('Imported from legacy records');

    const log = await prisma.auditLog.findFirst({
      where: { entityId: entry!.id, entityType: 'SocietyLedgerEntry' },
    });
    expect(log?.action).toBe('IMPORT_SOCIETY_LEDGER_ENTRY');
  });

  it('requires a bank reference unless paymentMethod is CASH', async () => {
    const csv =
      'direction,categoryname,amount,transactiondate,paymentmethod\n' +
      `EXPENSE,${expenseCategoryName},1000,2024-03-16,BANK_TRANSFER`;
    const result = await bulkImportSocietyLedgerEntries(societyId, adminId, csv);
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/bank\/transaction reference/);
  });

  it('rejects a direction/category mismatch as a row error', async () => {
    const csv =
      'direction,categoryname,amount,transactiondate,paymentmethod\n' +
      `EXPENSE,${incomeCategoryName},1000,2024-03-17,CASH`;
    const result = await bulkImportSocietyLedgerEntries(societyId, adminId, csv);
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/direction/);
  });

  it('reports a row error for an unknown category, without failing the batch', async () => {
    const csv =
      'direction,categoryname,amount,transactiondate,paymentmethod\n' +
      `INCOME,Nonexistent Category,100,2024-03-18,CASH\n` +
      `INCOME,${incomeCategoryName},100,2024-03-19,CASH`;
    const result = await bulkImportSocietyLedgerEntries(societyId, adminId, csv);
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/not available/);
  });

  it('returns a top-level error for a CSV missing required columns', async () => {
    const csv = 'direction,amount\nINCOME,100';
    const result = await bulkImportSocietyLedgerEntries(societyId, adminId, csv);
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/Missing required column/);
  });
});
