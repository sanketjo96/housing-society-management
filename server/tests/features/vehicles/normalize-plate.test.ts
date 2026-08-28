import { describe, expect, it } from 'vitest';
import { normalizePlate } from '../../../src/shared/vehicles/normalize-plate';

describe('normalizePlate', () => {
  it('uppercases lowercase input', () => {
    expect(normalizePlate('mh12ab1234')).toBe('MH12AB1234');
  });

  it('strips spaces', () => {
    expect(normalizePlate('MH12 AB 1234')).toBe('MH12AB1234');
  });

  it('strips dashes', () => {
    expect(normalizePlate('MH-12-AB-1234')).toBe('MH12AB1234');
  });

  it('collapses visually-different variants of the same plate to one canonical value', () => {
    const variants = ['MH12 AB 1234', 'mh-12-ab-1234', 'MH12AB1234', ' mh12 ab-1234 '];
    const normalized = new Set(variants.map(normalizePlate));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe('MH12AB1234');
  });
});
