import { describe, expect, it } from 'vitest';
import { toIndianCurrencyWords } from '../../src/lib/number-to-words';

describe('toIndianCurrencyWords', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [1, 'Rupees One Only'],
    [15, 'Rupees Fifteen Only'],
    [100, 'Rupees One Hundred Only'],
    [999, 'Rupees Nine Hundred and Ninety Nine Only'],
    [1000, 'Rupees One Thousand Only'],
    [1500, 'Rupees One Thousand Five Hundred Only'],
    [100000, 'Rupees One Lakh Only'],
    [10000000, 'Rupees One Crore Only'],
    [1234567, 'Rupees Twelve Lakh Thirty Four Thousand Five Hundred and Sixty Seven Only'],
  ])('renders %d as %s', (amount, expected) => {
    expect(toIndianCurrencyWords(amount)).toBe(expected);
  });

  it('spells out paise when the amount has a fractional part', () => {
    expect(toIndianCurrencyWords(1500.5)).toBe('Rupees One Thousand Five Hundred and Fifty Paise Only');
  });

  it('handles a large amount with rupees and paise together', () => {
    expect(toIndianCurrencyWords(9999999.99)).toBe(
      'Rupees Ninety Nine Lakh Ninety Nine Thousand Nine Hundred and Ninety Nine and Ninety Nine Paise Only',
    );
  });

  it('carries a rounded-to-100 paise value into the rupee amount', () => {
    // 19 + 0.995 rounds to 100 paise at 2dp precision — must not render "100 Paise".
    expect(toIndianCurrencyWords(19.995)).toBe('Rupees Twenty Only');
  });

  it('throws for a negative amount', () => {
    expect(() => toIndianCurrencyWords(-1)).toThrow();
  });

  it('throws for a non-finite amount', () => {
    expect(() => toIndianCurrencyWords(NaN)).toThrow();
    expect(() => toIndianCurrencyWords(Infinity)).toThrow();
  });
});
