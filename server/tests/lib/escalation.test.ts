import { describe, expect, it } from 'vitest';
import { buildEscalationMessage, DEFAULT_GRACE_PERIOD_DAYS, isOverdue } from '../../src/lib/escalation';

describe('isOverdue', () => {
  it('is not overdue before the due date', () => {
    const dueDate = new Date('2026-08-01');
    const now = new Date('2026-07-31');
    expect(isOverdue(dueDate, DEFAULT_GRACE_PERIOD_DAYS, now)).toBe(false);
  });

  it('is not overdue within the grace period after the due date', () => {
    const dueDate = new Date('2026-08-01');
    const now = new Date('2026-08-05'); // 4 days past due, grace is 7
    expect(isOverdue(dueDate, DEFAULT_GRACE_PERIOD_DAYS, now)).toBe(false);
  });

  it('is not overdue exactly at the grace deadline', () => {
    const dueDate = new Date('2026-08-01');
    const now = new Date('2026-08-08'); // exactly 7 days past due
    expect(isOverdue(dueDate, DEFAULT_GRACE_PERIOD_DAYS, now)).toBe(false);
  });

  it('is overdue once past the grace deadline', () => {
    const dueDate = new Date('2026-08-01');
    const now = new Date('2026-08-09'); // 8 days past due
    expect(isOverdue(dueDate, DEFAULT_GRACE_PERIOD_DAYS, now)).toBe(true);
  });

  it('respects a custom grace period', () => {
    const dueDate = new Date('2026-08-01');
    const now = new Date('2026-08-03'); // 2 days past due
    expect(isOverdue(dueDate, 1, now)).toBe(true);
    expect(isOverdue(dueDate, 3, now)).toBe(false);
  });
});

describe('buildEscalationMessage', () => {
  it('includes the recipient, flat, amount, and due date in plain text', () => {
    const message = buildEscalationMessage({
      recipientName: 'Alice Owner',
      wing: 'A',
      flatNumber: '101',
      outstandingTotal: 3000,
      oldestDueDate: new Date('2026-06-16'),
      societyName: 'Sunrise Residency',
    });

    expect(message).toContain('Alice Owner');
    expect(message).toContain('A-101');
    expect(message).toContain('3,000');
    expect(message).toContain('Sunrise Residency');
    expect(message).toContain('16 Jun 2026');
  });
});
