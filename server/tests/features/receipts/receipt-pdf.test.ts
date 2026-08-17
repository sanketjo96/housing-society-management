import { PDFParse } from 'pdf-parse';
import { describe, expect, it } from 'vitest';
import { renderReceiptPdf, type ReceiptData } from '../../../src/features/receipts/receipt-pdf';

// A minimal valid 1x1 transparent PNG — enough for pdfkit's doc.image() to embed
// without needing a real signature file on disk.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const baseData: ReceiptData = {
  receiptNumber: 'RCPT-A101-abc123',
  societyName: 'Sunrise Residency',
  societyAddress: '12 Garden Road, Pune',
  residentName: 'Priya Nair',
  flatLabel: 'A-101',
  date: new Date('2026-08-11'),
  transactionType: 'DEPOSIT',
  purpose: 'Maintenance dues payment',
  amount: 1500.5,
  chairmanName: 'Ramesh Kulkarni',
  secretaryName: 'Sunita Deshmukh',
  footerNote: 'This is a computer-generated receipt.',
};

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

describe('renderReceiptPdf', () => {
  it('produces a valid PDF buffer', async () => {
    const buffer = await renderReceiptPdf(baseData);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('includes the receipt number, resident, flat, purpose, and amount in words', async () => {
    const buffer = await renderReceiptPdf(baseData);
    const text = await extractText(buffer);

    expect(text).toContain('RCPT-A101-abc123');
    expect(text).toContain('Priya Nair');
    expect(text).toContain('A-101');
    expect(text).toContain('Maintenance dues payment');
    expect(text).toContain('Rupees One Thousand Five Hundred and Fifty Paise Only');
    expect(text).toContain('Sunrise Residency');
    expect(text).toContain('Ramesh Kulkarni');
    expect(text).toContain('Chairman');
    expect(text).toContain('Sunita Deshmukh');
    expect(text).toContain('Secretary');
    expect(text).toContain('This is a computer-generated receipt.');
  });

  it('renders a CREDIT entry with its own purpose text and type label', async () => {
    const buffer = await renderReceiptPdf({
      ...baseData,
      transactionType: 'CREDIT',
      purpose: 'Repair cost settled against maintenance',
    });
    const text = await extractText(buffer);

    expect(text).toContain('Credit Adjustment');
    expect(text).toContain('Repair cost settled against maintenance');
  });

  it('renders without either signatory name, without throwing', async () => {
    const buffer = await renderReceiptPdf({
      ...baseData,
      chairmanName: undefined,
      secretaryName: undefined,
    });
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders with only one signatory assigned (the other role vacant)', async () => {
    const buffer = await renderReceiptPdf({ ...baseData, secretaryName: undefined });
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const text = await extractText(buffer);
    expect(text).toContain('Ramesh Kulkarni');
    expect(text).toContain('Chairman');
    expect(text).toContain('Secretary');
  });

  it('embeds signature images when supplied', async () => {
    const withSignatures = await renderReceiptPdf(baseData, {
      chairman: TINY_PNG,
      secretary: TINY_PNG,
    });
    const withoutSignatures = await renderReceiptPdf(baseData);

    expect(withSignatures.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // Embedding images meaningfully increases the PDF's byte size versus the
    // blank-line fallback — a cheap way to assert the image path actually ran.
    expect(withSignatures.length).toBeGreaterThan(withoutSignatures.length);
  });

  it('falls back to the blank signature line if a signature buffer is corrupt', async () => {
    const buffer = await renderReceiptPdf(baseData, {
      chairman: Buffer.from('not a real image'),
      secretary: Buffer.from('not a real image'),
    });
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const text = await extractText(buffer);
    expect(text).toContain('Ramesh Kulkarni');
    expect(text).toContain('Sunita Deshmukh');
  });
});
