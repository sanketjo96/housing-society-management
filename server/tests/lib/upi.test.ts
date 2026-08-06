import { describe, expect, it } from 'vitest';
import { buildUpiDeepLink, generateQrDataUrl } from '../../src/lib/upi';

describe('buildUpiDeepLink', () => {
  it('builds a upi://pay deep link with the standard query params', () => {
    const link = buildUpiDeepLink({
      vpa: 'sunrise-residency@okhdfcbank',
      payeeName: 'Sunrise Residency',
      amount: 3000,
      note: 'Maintenance (2 records)',
    });

    expect(link.startsWith('upi://pay?')).toBe(true);
    const params = new URLSearchParams(link.slice('upi://pay?'.length));
    expect(params.get('pa')).toBe('sunrise-residency@okhdfcbank');
    expect(params.get('pn')).toBe('Sunrise Residency');
    expect(params.get('am')).toBe('3000.00');
    expect(params.get('cu')).toBe('INR');
    expect(params.get('tn')).toBe('Maintenance (2 records)');
  });

  it('formats the amount to exactly 2 decimal places', () => {
    const link = buildUpiDeepLink({ vpa: 'a@b', payeeName: 'X', amount: 1250.5, note: 'n' });
    const params = new URLSearchParams(link.slice('upi://pay?'.length));
    expect(params.get('am')).toBe('1250.50');
  });
});

describe('generateQrDataUrl', () => {
  it('returns a base64 PNG data URL', async () => {
    const dataUrl = await generateQrDataUrl('upi://pay?pa=a@b&pn=X&am=100.00&cu=INR&tn=test');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
