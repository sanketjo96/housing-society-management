import { describe, expect, it } from 'vitest';
import { calculateMonthlyRate } from '../../../src/shared/billing/rate-calculation';

describe('calculateMonthlyRate', () => {
  const ownerId = 'owner-1';

  it('bills the owner at 1x when there is no occupancy change at all in the month', () => {
    const result = calculateMonthlyRate('2026-06', 2000, 1.5, ownerId, []);
    expect(result).toEqual({ payerType: 'OWNER', payerId: ownerId, amount: 2000 });
  });

  it('bills the tenant at the factored rate when they occupy the whole month', () => {
    const result = calculateMonthlyRate('2026-06', 2000, 1.5, ownerId, [
      { tenantId: 'tenant-1', effectiveStart: new Date('2026-01-01'), effectiveEnd: null },
    ]);
    expect(result).toEqual({ payerType: 'TENANT', payerId: 'tenant-1', amount: 3000 });
  });

  it("CLAUDE.md's worked example: owner Aug 1-10, tenant Aug 11-31 -> tenant majority (21 vs 10) bills the whole month", () => {
    const result = calculateMonthlyRate('2026-08', 2000, 1.5, ownerId, [
      { tenantId: 'tenant-1', effectiveStart: new Date('2026-08-11'), effectiveEnd: null },
    ]);
    expect(result).toEqual({ payerType: 'TENANT', payerId: 'tenant-1', amount: 3000 });
  });

  it('owner majority bills the owner for the whole month', () => {
    // Tenant only Aug 25-31 (7 days) vs owner 24 days.
    const result = calculateMonthlyRate('2026-08', 2000, 1.5, ownerId, [
      { tenantId: 'tenant-1', effectiveStart: new Date('2026-08-25'), effectiveEnd: null },
    ]);
    expect(result).toEqual({ payerType: 'OWNER', payerId: ownerId, amount: 2000 });
  });

  it('exact tie: the status active on the last day of the month wins (tenant)', () => {
    // June 2026 has 30 days. Tenant Jun 16-30 = 15 days, owner Jun 1-15 = 15 days.
    const result = calculateMonthlyRate('2026-06', 2000, 1.5, ownerId, [
      { tenantId: 'tenant-1', effectiveStart: new Date('2026-06-16'), effectiveEnd: null },
    ]);
    expect(result).toEqual({ payerType: 'TENANT', payerId: 'tenant-1', amount: 3000 });
  });

  it('exact tie where the owner is active on the last day wins for the owner', () => {
    // June 2026, 30 days. Tenant Jun 1-15 (15 days), then reverts to owner Jun 16-30 (15 days).
    const result = calculateMonthlyRate('2026-06', 2000, 1.5, ownerId, [
      {
        tenantId: 'tenant-1',
        effectiveStart: new Date('2026-06-01'),
        effectiveEnd: new Date('2026-06-15'),
      },
    ]);
    expect(result).toEqual({ payerType: 'OWNER', payerId: ownerId, amount: 2000 });
  });

  it('tenant-to-tenant turnover mid-month bills whichever tenant had more days', () => {
    // Aug 2026, 31 days. Tenant A Aug 1-10 (10 days), Tenant B Aug 11-31 (21 days).
    const result = calculateMonthlyRate('2026-08', 2000, 1.5, ownerId, [
      {
        tenantId: 'tenant-A',
        effectiveStart: new Date('2026-08-01'),
        effectiveEnd: new Date('2026-08-10'),
      },
      { tenantId: 'tenant-B', effectiveStart: new Date('2026-08-11'), effectiveEnd: null },
    ]);
    expect(result).toEqual({ payerType: 'TENANT', payerId: 'tenant-B', amount: 3000 });
  });

  it('ignores occupancy rows entirely outside the requested month', () => {
    const result = calculateMonthlyRate('2026-06', 2000, 1.5, ownerId, [
      {
        tenantId: 'tenant-1',
        effectiveStart: new Date('2026-01-01'),
        effectiveEnd: new Date('2026-01-31'),
      },
    ]);
    expect(result).toEqual({ payerType: 'OWNER', payerId: ownerId, amount: 2000 });
  });

  it('rounds a fractional tenant rate to 2 decimal places', () => {
    const result = calculateMonthlyRate('2026-06', 1000.33, 1.33, ownerId, [
      { tenantId: 'tenant-1', effectiveStart: new Date('2026-01-01'), effectiveEnd: null },
    ]);
    // 1000.33 * 1.33 = 1330.4389 -> rounds to 1330.44
    expect(result.amount).toBe(1330.44);
  });
});
