import { describe, expect, it } from 'vitest';
import { extractBankReference } from '../../../src/shared/billing/bank-reference-extractor';

describe('extractBankReference', () => {
  it('extracts a Google Pay UPI transaction ID', () => {
    const text = `
      ₹2,000
      Paid to Saral Society
      Completed
      15 Aug 2026, 10:42 am
      UPI transaction ID: 402812345678
      Google transaction ID CICAgKDcpvz3LQ
    `;
    expect(extractBankReference(text)).toBe('402812345678');
  });

  it('extracts a PhonePe transaction ID', () => {
    const text = `
      Payment Successful
      ₹1,500 paid to Saral Society
      Transaction ID T2308151234567890123
      Paid by PhonePe
    `;
    expect(extractBankReference(text)).toBe('T2308151234567890123');
  });

  it('extracts a Paytm UPI reference number', () => {
    const text = `
      Payment Successful
      UPI Ref No. 987654321098
      To Saral Society
    `;
    expect(extractBankReference(text)).toBe('987654321098');
  });

  it('extracts a labeled UTR when no app-specific label is present', () => {
    const text = `Bank transfer receipt\nUTR: 305612345678\nAmount: Rs. 3000`;
    expect(extractBankReference(text)).toBe('305612345678');
  });

  it('falls back to a bare 12-digit number when no label is recognized', () => {
    const text = `Some garbled OCR text 402812345678 with no clear label`;
    expect(extractBankReference(text)).toBe('402812345678');
  });

  it('returns null for unrecognized or empty text, never throws', () => {
    expect(extractBankReference('')).toBeNull();
    expect(extractBankReference('Thank you for your payment!')).toBeNull();
  });
});
