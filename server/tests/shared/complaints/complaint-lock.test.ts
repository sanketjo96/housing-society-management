import { describe, expect, it } from 'vitest';
import { isEditable } from '../../../src/shared/complaints/complaint-lock';

describe('isEditable', () => {
  it('is editable when Open with zero upvotes', () => {
    expect(isEditable('OPEN', 0)).toBe(true);
  });

  it('is not editable once it has at least one upvote, even while Open', () => {
    expect(isEditable('OPEN', 1)).toBe(false);
    expect(isEditable('OPEN', 5)).toBe(false);
  });

  it('is not editable once status moves off Open, even with zero upvotes', () => {
    expect(isEditable('IN_PROGRESS', 0)).toBe(false);
    expect(isEditable('RESOLVED', 0)).toBe(false);
    expect(isEditable('REJECTED', 0)).toBe(false);
  });

  it('is not editable when both conditions are against it', () => {
    expect(isEditable('RESOLVED', 3)).toBe(false);
  });

  it('is stateless: re-evaluating against reverted state returns editable again', () => {
    // Same call, no memory of a prior "locked" state — this is the whole
    // point of not storing a lockedAt flag (see 01-requirements.md
    // Confirmed Product Decision #7).
    expect(isEditable('OPEN', 1)).toBe(false);
    expect(isEditable('OPEN', 0)).toBe(true);
    expect(isEditable('RESOLVED', 0)).toBe(false);
    expect(isEditable('OPEN', 0)).toBe(true);
  });
});
